import { config } from "../config.js";
import { query } from "../db.js";
import { ensureClass } from "../qbo/classes.js";
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

const normalizeTxnType = (value: string) => value.toLowerCase().replace(/\s+/g, "");

const resolveEntity = (txnType: string | null): EntityMap | null => {
  if (!txnType) return null;
  const type = normalizeTxnType(txnType);
  const map: Record<string, EntityMap> = {
    bill: { endpoint: "bill", key: "Bill" },
    invoice: { endpoint: "invoice", key: "Invoice" },
    payment: { endpoint: "payment", key: "Payment" },
    salesreceipt: { endpoint: "salesreceipt", key: "SalesReceipt" },
    purchase: { endpoint: "purchase", key: "Purchase" },
    expense: { endpoint: "purchase", key: "Purchase" },
    journalentry: { endpoint: "journalentry", key: "JournalEntry" },
    deposit: { endpoint: "deposit", key: "Deposit" },
    transfer: { endpoint: "transfer", key: "Transfer" },
    creditmemo: { endpoint: "creditmemo", key: "CreditMemo" },
    refundreceipt: { endpoint: "refundreceipt", key: "RefundReceipt" },
    vendorcredit: { endpoint: "vendorcredit", key: "VendorCredit" },
    check: { endpoint: "check", key: "Check" },
    billpayment: { endpoint: "billpayment", key: "BillPayment" }
  };

  return map[type] ?? null;
};

const applyClassRef = (line: any, classRef: { value: string; name?: string }) => {
  const updated = { ...line };
  const detailType = line?.DetailType;
  if (!detailType) return updated;

  switch (detailType) {
    case "AccountBasedExpenseLineDetail":
      updated.AccountBasedExpenseLineDetail = {
        ...line.AccountBasedExpenseLineDetail,
        ClassRef: classRef
      };
      break;
    case "ItemBasedExpenseLineDetail":
      updated.ItemBasedExpenseLineDetail = {
        ...line.ItemBasedExpenseLineDetail,
        ClassRef: classRef
      };
      break;
    case "SalesItemLineDetail":
      updated.SalesItemLineDetail = {
        ...line.SalesItemLineDetail,
        ClassRef: classRef
      };
      break;
    case "JournalEntryLineDetail":
      updated.JournalEntryLineDetail = {
        ...line.JournalEntryLineDetail,
        ClassRef: classRef
      };
      break;
    default:
      break;
  }

  return updated;
};

const buildLineUpdate = (line: any, classRef: { value: string; name?: string }) => {
  const updated = applyClassRef(line, classRef);
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

    try {
      const classId = await ensureClass(conn.realm_id, row.ai_category);
      await query(
        "UPDATE qbo_transaction_list_rows SET qb_class_id=$1, updated_at=NOW() WHERE id=$2",
        [classId, row.id]
      );

      const transaction = await qboGet<any>(`/v3/company/${conn.realm_id}/${entity.endpoint}/${row.txn_id}`, {
        minorversion: config.qbo.minorVersion
      });
      const payload = transaction?.[entity.key];
      if (!payload?.Id || !payload?.SyncToken) {
        throw new Error("Missing Id or SyncToken in transaction payload.");
      }

      const classRef = { value: classId, name: row.ai_category };
      const lines = Array.isArray(payload.Line) ? payload.Line : [];
      const updatedLines = lines.map((line: any) => buildLineUpdate(line, classRef));

      const updatePayload = {
        Id: payload.Id,
        SyncToken: payload.SyncToken,
        sparse: true,
        Line: updatedLines
      };

      await qboPost<any>(`/v3/company/${conn.realm_id}/${entity.endpoint}`, updatePayload, {
        minorversion: config.qbo.minorVersion
      });

      await query(
        "UPDATE qbo_transaction_list_rows SET qb_sync_status='synced', qb_sync_error=NULL, updated_at=NOW() WHERE id=$1",
        [row.id]
      );
      synced += 1;
      processed += 1;
      options?.onProgress?.({ total, processed, synced, skipped, failed });
    } catch (err: any) {
      await query(
        "UPDATE qbo_transaction_list_rows SET qb_sync_status='failed', qb_sync_error=$1, updated_at=NOW() WHERE id=$2",
        [err.message ?? "Sync failed", row.id]
      );
      failed += 1;
      processed += 1;
      options?.onProgress?.({ total, processed, synced, skipped, failed });
    }
  }

  return { total, processed, synced, skipped, failed };
};
