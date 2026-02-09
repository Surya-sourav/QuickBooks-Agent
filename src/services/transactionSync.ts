import { config } from "../config.js";
import { query } from "../db.js";
import { getConnection, qboGet, qboPost } from "../qbo/client.js";

type SyncRow = {
  id: number;
  txn_id: string | null;
  txn_type: string | null;
  ai_category: string | null;
};

type EntityMap = {
  endpoint: string;
  key: string;
};

const normalizeTxnType = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const resolveEntity = (txnType: string | null): EntityMap | null => {
  if (!txnType) return null;
  const type = normalizeTxnType(txnType);
  const map: Record<string, EntityMap> = {
    bill: { endpoint: "bill", key: "Bill" },
    invoice: { endpoint: "invoice", key: "Invoice" },
    salesreceipt: { endpoint: "salesreceipt", key: "SalesReceipt" },
    purchase: { endpoint: "purchase", key: "Purchase" },
    expense: { endpoint: "purchase", key: "Purchase" },
    journalentry: { endpoint: "journalentry", key: "JournalEntry" },
    creditmemo: { endpoint: "creditmemo", key: "CreditMemo" },
    refundreceipt: { endpoint: "refundreceipt", key: "RefundReceipt" },
    vendorcredit: { endpoint: "vendorcredit", key: "VendorCredit" },
    check: { endpoint: "check", key: "Check" },
    billpaymentcheck: { endpoint: "billpaymentcheck", key: "BillPaymentCheck" },
    billpaymentcreditcard: { endpoint: "billpaymentcreditcard", key: "BillPaymentCreditCard" }
  };

  return map[type] ?? null;
};

const unsupportedUpdateEndpoints = new Set([
  "check",
  "billpaymentcheck",
  "billpaymentcreditcard"
]);

const requiredRefsByEntity: Record<string, string[]> = {
  Bill: ["VendorRef"],
  VendorCredit: ["VendorRef"],
  Invoice: ["CustomerRef"],
  SalesReceipt: ["CustomerRef"],
  CreditMemo: ["CustomerRef"],
  RefundReceipt: ["CustomerRef"]
};

const resolveAccountForCategory = async (category: string | null) => {
  if (!category) return null;
  const mapped = await query(
    "SELECT account_id, account_name FROM ai_category_account_map WHERE category = $1",
    [category]
  );
  if (mapped.rows[0]) {
    return { value: mapped.rows[0].account_id, name: mapped.rows[0].account_name ?? undefined };
  }

  const guess = await query(
    "SELECT qbo_id, name FROM qbo_accounts WHERE lower(name) = lower($1) OR lower(name) LIKE lower($2) LIMIT 1",
    [category, `%${category}%`]
  );
  if (guess.rows[0]) {
    return { value: guess.rows[0].qbo_id, name: guess.rows[0].name };
  }

  return null;
};

const applyAccountRef = (line: any, accountRef: { value: string; name?: string }) => {
  const updated = { ...line };
  const detailType = line?.DetailType;
  if (!detailType) return null;

  switch (detailType) {
    case "AccountBasedExpenseLineDetail":
      updated.AccountBasedExpenseLineDetail = {
        ...line.AccountBasedExpenseLineDetail,
        AccountRef: accountRef
      };
      break;
    case "JournalEntryLineDetail":
      updated.JournalEntryLineDetail = {
        ...line.JournalEntryLineDetail,
        AccountRef: accountRef
      };
      break;
    default:
      return null;
  }

  return updated;
};

const buildLineUpdate = (line: any, accountRef: { value: string; name?: string }) => {
  const updated = applyAccountRef(line, accountRef);
  if (!updated) return null;
  return {
    Id: updated.Id,
    DetailType: updated.DetailType,
    Amount: updated.Amount,
    AccountBasedExpenseLineDetail: updated.AccountBasedExpenseLineDetail,
    ItemBasedExpenseLineDetail: updated.ItemBasedExpenseLineDetail,
    SalesItemLineDetail: updated.SalesItemLineDetail,
    JournalEntryLineDetail: updated.JournalEntryLineDetail,
    Description: updated.Description
  };
};

export const syncCategorizedTransactions = async (
  limit = 50,
  options?: { onProgress?: (state: { total: number; processed: number; synced: number; skipped: number; failed: number }) => void }
) => {
  const conn = await getConnection();
  if (!conn) throw new Error("No QuickBooks connection found.");

  const rowsRes = await query<SyncRow>(
    `SELECT id, txn_id, txn_type, ai_category
     FROM qbo_transaction_list_rows
     WHERE ai_category IS NOT NULL
       AND (qb_sync_status IS NULL OR qb_sync_status <> 'synced')
     ORDER BY txn_date DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  const rows = rowsRes.rows;
  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  const total = rows.length;

  for (const row of rows) {
    if (!row.txn_id || !row.txn_type || !row.ai_category) {
      await query(
        "UPDATE qbo_transaction_list_rows SET qb_sync_status='skipped', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
        ["Missing txn_id, txn_type, or category.", row.id]
      );
      skipped += 1;
      processed += 1;
      options?.onProgress?.({ total, processed, synced, skipped, failed });
      continue;
    }

    const entity = resolveEntity(row.txn_type);
    if (!entity) {
      await query(
        "UPDATE qbo_transaction_list_rows SET qb_sync_status='skipped', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
        [`Unsupported txn_type: ${row.txn_type}`, row.id]
      );
      skipped += 1;
      processed += 1;
      options?.onProgress?.({ total, processed, synced, skipped, failed });
      continue;
    }
    if (unsupportedUpdateEndpoints.has(entity.endpoint)) {
      await query(
        "UPDATE qbo_transaction_list_rows SET qb_sync_status='skipped', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
        [`Update not supported for ${entity.key}.`, row.id]
      );
      skipped += 1;
      processed += 1;
      options?.onProgress?.({ total, processed, synced, skipped, failed });
      continue;
    }

    try {
      const transaction = await qboGet<any>(`/v3/company/${conn.realm_id}/${entity.endpoint}/${row.txn_id}`, {
        minorversion: config.qbo.minorVersion
      });
      const payload = transaction?.[entity.key];
      if (!payload?.Id || !payload?.SyncToken) {
        throw new Error("Missing Id or SyncToken in transaction payload.");
      }

      const accountRef = await resolveAccountForCategory(row.ai_category);
      if (!accountRef) {
        await query(
          "UPDATE qbo_transaction_list_rows SET qb_sync_status='skipped', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
          [`No account mapping for category: ${row.ai_category}`, row.id]
        );
        skipped += 1;
        processed += 1;
        options?.onProgress?.({ total, processed, synced, skipped, failed });
        continue;
      }

      const lines = Array.isArray(payload.Line) ? payload.Line : [];
      const updatedLines = lines
        .map((line: any) => buildLineUpdate(line, accountRef))
        .filter(Boolean);

      if (updatedLines.length === 0) {
        await query(
          "UPDATE qbo_transaction_list_rows SET qb_sync_status='skipped', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
          ["No account-eligible lines found.", row.id]
        );
        skipped += 1;
        processed += 1;
        options?.onProgress?.({ total, processed, synced, skipped, failed });
        continue;
      }

      const requiredRefs = requiredRefsByEntity[entity.key] ?? [];
      let missingRequired = false;
      for (const ref of requiredRefs) {
        if (!payload?.[ref]) {
          await query(
            "UPDATE qbo_transaction_list_rows SET qb_sync_status='skipped', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
            [`Missing required ${ref} for ${entity.key}.`, row.id]
          );
          skipped += 1;
          processed += 1;
          options?.onProgress?.({ total, processed, synced, skipped, failed });
          missingRequired = true;
          break;
        }
      }
      if (missingRequired) {
        continue;
      }

      const updatePayload: any = {
        Id: payload.Id,
        SyncToken: payload.SyncToken,
        sparse: true,
        Line: updatedLines
      };

      if (payload.VendorRef) updatePayload.VendorRef = payload.VendorRef;
      if (payload.CustomerRef) updatePayload.CustomerRef = payload.CustomerRef;
      if (payload.PayeeRef) updatePayload.PayeeRef = payload.PayeeRef;
      if (payload.EntityRef) updatePayload.EntityRef = payload.EntityRef;
      if (payload.AccountRef) updatePayload.AccountRef = payload.AccountRef;
      if (payload.PaymentType) updatePayload.PaymentType = payload.PaymentType;
      if (payload.TxnDate) updatePayload.TxnDate = payload.TxnDate;
      if (payload.CurrencyRef) updatePayload.CurrencyRef = payload.CurrencyRef;
      if (payload.GlobalTaxCalculation) updatePayload.GlobalTaxCalculation = payload.GlobalTaxCalculation;
      if (payload.TxnTaxDetail) updatePayload.TxnTaxDetail = payload.TxnTaxDetail;
      if (payload.TxnTaxCodeRef) updatePayload.TxnTaxCodeRef = payload.TxnTaxCodeRef;

      await qboPost<any>(`/v3/company/${conn.realm_id}/${entity.endpoint}`, updatePayload, {
        minorversion: config.qbo.minorVersion
      });

      await query(
        "UPDATE qbo_transaction_list_rows SET qb_sync_status='synced', qb_sync_error=NULL, account=COALESCE($1, account), updated_at=NOW() WHERE id=$2",
        [accountRef.name ?? null, row.id]
      );
      synced += 1;
      processed += 1;
      options?.onProgress?.({ total, processed, synced, skipped, failed });
    } catch (err: any) {
      const msg = (err?.message ?? "Sync failed").toString();
      const trimmed = msg.length > 500 ? `${msg.slice(0, 500)}...` : msg;
      const notSupported = /operation .* not supported/i.test(msg);
      if (notSupported) {
        await query(
          "UPDATE qbo_transaction_list_rows SET qb_sync_status='skipped', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
          [trimmed, row.id]
        );
        skipped += 1;
        processed += 1;
        options?.onProgress?.({ total, processed, synced, skipped, failed });
      } else {
        await query(
          "UPDATE qbo_transaction_list_rows SET qb_sync_status='failed', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
          [trimmed, row.id]
        );
        failed += 1;
        processed += 1;
        options?.onProgress?.({ total, processed, synced, skipped, failed });
      }
    }
  }

  return { total, processed, synced, skipped, failed };
};
