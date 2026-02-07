import { config } from "../config.js";
import { query } from "../db.js";

export const buildSummary = async () => {
  const [customersRes, paymentsRes, journalRes, txnRes] = await Promise.all([
    query("SELECT COUNT(*)::int as count FROM qbo_customers"),
    query("SELECT COUNT(*)::int as count, COALESCE(SUM(total_amt),0) as total FROM qbo_payments"),
    query("SELECT COUNT(*)::int as count FROM qbo_journal_entries"),
    query("SELECT COUNT(*)::int as count FROM qbo_transaction_list_rows")
  ]);

  const monthlyPaymentsRes = await query(
    `SELECT to_char(date_trunc('month', txn_date), 'YYYY-MM') as month,
            COALESCE(SUM(total_amt),0) as total
     FROM qbo_payments
     WHERE txn_date IS NOT NULL
     GROUP BY 1
     ORDER BY 1`
  );

  const monthlyJournalRes = await query(
    `SELECT to_char(date_trunc('month', txn_date), 'YYYY-MM') as month,
            COUNT(*) as count
     FROM qbo_journal_entries
     WHERE txn_date IS NOT NULL
     GROUP BY 1
     ORDER BY 1`
  );

  const topCustomersRes = await query(
    `SELECT c.display_name, p.customer_ref, SUM(p.total_amt) as total
     FROM qbo_payments p
     LEFT JOIN qbo_customers c ON c.qbo_id = p.customer_ref
     WHERE p.total_amt IS NOT NULL
     GROUP BY c.display_name, p.customer_ref
     ORDER BY total DESC
     LIMIT 10`
  );

  const txnTypeRes = await query(
    `SELECT txn_type, COUNT(*) as count, COALESCE(SUM(amount),0) as total
     FROM qbo_transaction_list_rows
     GROUP BY txn_type
     ORDER BY count DESC` 
  );

  return {
    dateRange: {
      start: config.qbo.dataStartDate,
      end: config.qbo.dataEndDate
    },
    totalCustomers: customersRes.rows[0]?.count ?? 0,
    totalPayments: Number(paymentsRes.rows[0]?.total ?? 0),
    totalJournalEntries: journalRes.rows[0]?.count ?? 0,
    totalTransactionRows: txnRes.rows[0]?.count ?? 0,
    monthlyPayments: monthlyPaymentsRes.rows,
    monthlyJournalEntries: monthlyJournalRes.rows,
    topCustomers: topCustomersRes.rows,
    transactionTypeBreakdown: txnTypeRes.rows
  };
};
