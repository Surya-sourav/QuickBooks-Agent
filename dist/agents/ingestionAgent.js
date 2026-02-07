import { db } from "../db";
import { fetchAllEntities, fetchTransactionList } from "../qb/queries";
function toNumber(value) {
    if (value === null || value === undefined)
        return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
}
function normalizeKey(key) {
    return key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function parseJournalTotals(entry) {
    let debit = 0;
    let credit = 0;
    const lines = Array.isArray(entry?.Line) ? entry.Line : [];
    for (const line of lines) {
        const detail = line?.JournalEntryLineDetail;
        const amount = toNumber(line?.Amount) ?? 0;
        if (detail?.PostingType === "Debit") {
            debit += amount;
        }
        else if (detail?.PostingType === "Credit") {
            credit += amount;
        }
    }
    return { debit, credit };
}
async function upsertCustomer(customer) {
    const id = String(customer.Id ?? "");
    if (!id)
        return;
    await db.query(`insert into qbo_customers (id, display_name, active, data)
     values ($1, $2, $3, $4)
     on conflict (id)
     do update set display_name = excluded.display_name,
                   active = excluded.active,
                   data = excluded.data,
                   updated_at = now()`, [id, customer.DisplayName ?? customer.FullyQualifiedName ?? null, customer.Active ?? null, customer]);
}
async function upsertPayment(payment) {
    const id = String(payment.Id ?? "");
    if (!id)
        return;
    await db.query(`insert into qbo_payments (id, txn_date, amount, customer_ref, data)
     values ($1, $2, $3, $4, $5)
     on conflict (id)
     do update set txn_date = excluded.txn_date,
                   amount = excluded.amount,
                   customer_ref = excluded.customer_ref,
                   data = excluded.data,
                   updated_at = now()`, [
        id,
        payment.TxnDate ?? null,
        toNumber(payment.TotalAmt),
        payment.CustomerRef?.value ?? null,
        payment
    ]);
}
async function upsertJournalEntry(entry) {
    const id = String(entry.Id ?? "");
    if (!id)
        return;
    const totals = parseJournalTotals(entry);
    await db.query(`insert into qbo_journal_entries (id, txn_date, total_debit, total_credit, data)
     values ($1, $2, $3, $4, $5)
     on conflict (id)
     do update set txn_date = excluded.txn_date,
                   total_debit = excluded.total_debit,
                   total_credit = excluded.total_credit,
                   data = excluded.data,
                   updated_at = now()`, [id, entry.TxnDate ?? null, totals.debit, totals.credit, entry]);
}
async function upsertAccount(account) {
    const id = String(account.Id ?? "");
    if (!id)
        return;
    await db.query(`insert into qbo_accounts (id, name, account_type, data)
     values ($1, $2, $3, $4)
     on conflict (id)
     do update set name = excluded.name,
                   account_type = excluded.account_type,
                   data = excluded.data,
                   updated_at = now()`, [id, account.Name ?? null, account.AccountType ?? null, account]);
}
async function storeTransactionList(report, params) {
    const columns = Array.isArray(report?.Columns?.Column) ? report.Columns.Column : [];
    const columnKeys = columns.map((col) => col?.ColTitle ?? col?.ColName ?? "");
    const rows = Array.isArray(report?.Rows?.Row) ? report.Rows.Row : [];
    let stored = 0;
    for (const row of rows) {
        if (row?.type !== "Data") {
            continue;
        }
        const colData = Array.isArray(row?.ColData) ? row.ColData : [];
        const rowObject = {};
        colData.forEach((col, index) => {
            const key = columnKeys[index] || `col_${index + 1}`;
            rowObject[key] = col?.value ?? "";
        });
        const normalized = {};
        for (const [key, value] of Object.entries(rowObject)) {
            normalized[normalizeKey(key)] = value;
        }
        const txnType = normalized["txn_type"] ||
            normalized["transaction_type"] ||
            normalized["type"] ||
            null;
        const txnDate = normalized["date"] || normalized["txn_date"] || null;
        const amount = toNumber(normalized["amount"] ?? normalized["amount_due"] ?? normalized["open_balance"]);
        await db.query(`insert into qbo_transaction_list_rows (txn_type, txn_date, amount, row_json, report_params)
       values ($1, $2, $3, $4, $5)`, [txnType, txnDate, amount, rowObject, params]);
        stored += 1;
    }
    return stored;
}
export async function ingestAll() {
    const [customers, payments, journalEntries, accounts] = await Promise.all([
        fetchAllEntities("Customer"),
        fetchAllEntities("Payment"),
        fetchAllEntities("JournalEntry"),
        fetchAllEntities("Account")
    ]);
    for (const customer of customers) {
        await upsertCustomer(customer);
    }
    for (const payment of payments) {
        await upsertPayment(payment);
    }
    for (const entry of journalEntries) {
        await upsertJournalEntry(entry);
    }
    for (const account of accounts) {
        await upsertAccount(account);
    }
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 12);
    const startDateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = endDate.toISOString().slice(0, 10);
    const report = await fetchTransactionList({ startDate: startDateStr, endDate: endDateStr });
    const transactionListRows = await storeTransactionList(report, {
        startDate: startDateStr,
        endDate: endDateStr
    });
    await db.query(`insert into qbo_sync_runs (synced_at, summary)
     values (now(), $1)`, [
        {
            customers: customers.length,
            payments: payments.length,
            journalEntries: journalEntries.length,
            accounts: accounts.length,
            transactionListRows
        }
    ]);
    return {
        customers: customers.length,
        payments: payments.length,
        journalEntries: journalEntries.length,
        accounts: accounts.length,
        transactionListRows
    };
}
