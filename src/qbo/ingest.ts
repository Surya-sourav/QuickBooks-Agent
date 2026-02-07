import { config } from "../config.js";
import { query, withClient } from "../db.js";
import { getConnection, qboQuery, qboReport } from "./client.js";

const MAX_RESULTS = 1000;

type QueryResponse<T> = {
  QueryResponse?: {
    [key: string]: T[] | undefined;
    totalCount?: number;
  };
};

const dateRangeClause = (field: string, startDate: string, endDate: string) =>
  `${field} >= '${startDate}' AND ${field} <= '${endDate}'`;

const queryAll = async <T>(realmId: string, entity: string, whereClause: string) => {
  const items: T[] = [];
  let startPosition = 1;

  while (true) {
    const q = `SELECT * FROM ${entity} WHERE ${whereClause} STARTPOSITION ${startPosition} MAXRESULTS ${MAX_RESULTS}`;
    const res = await qboQuery<QueryResponse<T>>(realmId, q);
    const collection = res.QueryResponse?.[entity] as T[] | undefined;
    if (!collection || collection.length === 0) {
      break;
    }
    items.push(...collection);
    startPosition += collection.length;
    if (collection.length < MAX_RESULTS) {
      break;
    }
  }

  return items;
};

const upsertCustomers = async (customers: any[]) => {
  if (customers.length === 0) return;
  await withClient(async (client) => {
    for (const customer of customers) {
      await client.query(
        `INSERT INTO qbo_customers (qbo_id, display_name, active, last_updated_time, raw)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (qbo_id) DO UPDATE SET
           display_name=EXCLUDED.display_name,
           active=EXCLUDED.active,
           last_updated_time=EXCLUDED.last_updated_time,
           raw=EXCLUDED.raw,
           updated_at=NOW()` ,
        [
          customer.Id,
          customer.DisplayName ?? null,
          customer.Active ?? null,
          customer.MetaData?.LastUpdatedTime ?? null,
          customer
        ]
      );
    }
  });
};

const upsertPayments = async (payments: any[]) => {
  if (payments.length === 0) return;
  await withClient(async (client) => {
    for (const payment of payments) {
      await client.query(
        `INSERT INTO qbo_payments (qbo_id, txn_date, total_amt, customer_ref, raw)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (qbo_id) DO UPDATE SET
           txn_date=EXCLUDED.txn_date,
           total_amt=EXCLUDED.total_amt,
           customer_ref=EXCLUDED.customer_ref,
           raw=EXCLUDED.raw,
           updated_at=NOW()` ,
        [
          payment.Id,
          payment.TxnDate ?? null,
          payment.TotalAmt ?? null,
          payment.CustomerRef?.value ?? null,
          payment
        ]
      );
    }
  });
};

const upsertJournalEntries = async (entries: any[]) => {
  if (entries.length === 0) return;
  await withClient(async (client) => {
    for (const entry of entries) {
      await client.query(
        `INSERT INTO qbo_journal_entries (qbo_id, txn_date, total_amt, raw)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (qbo_id) DO UPDATE SET
           txn_date=EXCLUDED.txn_date,
           total_amt=EXCLUDED.total_amt,
           raw=EXCLUDED.raw,
           updated_at=NOW()` ,
        [
          entry.Id,
          entry.TxnDate ?? null,
          entry.TotalAmt ?? null,
          entry
        ]
      );
    }
  });
};

const parseReportRows = (report: any, startDate: string, endDate: string) => {
  const columns = report?.Columns?.Column ?? [];
  const columnTitles = columns.map((col: any) => (col.ColTitle ?? col.Name ?? "").toString());

  const rows: any[] = [];
  const walk = (row: any) => {
    if (row.ColData) {
      const record: Record<string, string> = {};
      row.ColData.forEach((col: any, idx: number) => {
        record[columnTitles[idx] || `col_${idx}`] = col.value ?? "";
      });
      rows.push({ record, raw: row });
    }
    if (row.Rows?.Row) {
      row.Rows.Row.forEach(walk);
    }
  };

  const rootRows = report?.Rows?.Row ?? [];
  rootRows.forEach(walk);

  const extract = (record: Record<string, string>, key: string) => {
    const match = Object.keys(record).find((k) => k.toLowerCase() === key.toLowerCase());
    return match ? record[match] : undefined;
  };

  return rows.map((row) => {
    const rec = row.record;
    const txnDate = extract(rec, "Date");
    const txnType = extract(rec, "Transaction Type") ?? extract(rec, "Type");
    const docNum = extract(rec, "Num") ?? extract(rec, "Doc Num");
    const name = extract(rec, "Name") ?? extract(rec, "Customer");
    const account = extract(rec, "Account");
    const amount = extract(rec, "Amount") ?? extract(rec, "Total");

    return {
      report_start_date: startDate,
      report_end_date: endDate,
      txn_date: txnDate ?? null,
      txn_type: txnType ?? null,
      doc_num: docNum ?? null,
      name: name ?? null,
      account: account ?? null,
      amount: amount ? Number(amount.replace(/,/g, "")) : null,
      raw: row.raw
    };
  });
};

const upsertTransactionList = async (rows: any[]) => {
  if (rows.length === 0) return;
  await withClient(async (client) => {
    for (const row of rows) {
      await client.query(
        `INSERT INTO qbo_transaction_list_rows (report_start_date, report_end_date, txn_date, txn_type, doc_num, name, account, amount, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)` ,
        [
          row.report_start_date,
          row.report_end_date,
          row.txn_date,
          row.txn_type,
          row.doc_num,
          row.name,
          row.account,
          row.amount,
          row.raw
        ]
      );
    }
  });
};

const chunkMonths = (start: Date, end: Date, maxMonths = 6) => {
  const chunks: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));

  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + maxMonths, 0));
    if (chunkEnd > end) {
      chunkEnd.setUTCFullYear(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    }
    chunks.push({ start: chunkStart, end: chunkEnd });
    cursor = new Date(Date.UTC(chunkEnd.getUTCFullYear(), chunkEnd.getUTCMonth() + 1, 1));
  }

  return chunks;
};

export const ingestAll = async () => {
  const conn = await getConnection();
  if (!conn) throw new Error("No QuickBooks connection found.");

  const startDate = config.qbo.dataStartDate;
  const endDate = config.qbo.dataEndDate;

  const customers = await queryAll<any>(conn.realm_id, "Customer", dateRangeClause("Metadata.LastUpdatedTime", startDate, endDate));
  await upsertCustomers(customers);

  const payments = await queryAll<any>(conn.realm_id, "Payment", dateRangeClause("TxnDate", startDate, endDate));
  await upsertPayments(payments);

  const journalEntries = await queryAll<any>(conn.realm_id, "JournalEntry", dateRangeClause("TxnDate", startDate, endDate));
  await upsertJournalEntries(journalEntries);

  const chunks = chunkMonths(new Date(startDate), new Date(endDate), 6);
  for (const chunk of chunks) {
    await query(
      "DELETE FROM qbo_transaction_list_rows WHERE report_start_date=$1 AND report_end_date=$2",
      [chunk.start.toISOString().slice(0, 10), chunk.end.toISOString().slice(0, 10)]
    );
    const report = await qboReport<any>(conn.realm_id, "TransactionList", {
      start_date: chunk.start.toISOString().slice(0, 10),
      end_date: chunk.end.toISOString().slice(0, 10)
    });
    const rows = parseReportRows(report, chunk.start.toISOString().slice(0, 10), chunk.end.toISOString().slice(0, 10));
    await upsertTransactionList(rows);
  }

  const totals = await query(
    `SELECT
      (SELECT COUNT(*) FROM qbo_customers) as customers,
      (SELECT COUNT(*) FROM qbo_payments) as payments,
      (SELECT COUNT(*) FROM qbo_journal_entries) as journal_entries,
      (SELECT COUNT(*) FROM qbo_transaction_list_rows) as transaction_rows`
  );

  return totals.rows[0];
};
