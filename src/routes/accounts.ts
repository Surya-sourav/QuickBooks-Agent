import { Router } from "express";
import { query } from "../db.js";

export const accountsRouter = Router();

accountsRouter.get("/", async (_req, res) => {
  try {
    const rowsRes = await query(
      `SELECT
         t.account as name,
         a.account_type,
         a.account_sub_type,
         a.classification,
         COUNT(*)::int as txn_count,
         COALESCE(SUM(t.amount), 0) as total_amount
       FROM qbo_transaction_list_rows t
       LEFT JOIN qbo_accounts a ON a.name = t.account
       WHERE t.account IS NOT NULL AND t.account <> ''
       GROUP BY t.account, a.account_type, a.account_sub_type, a.classification
       ORDER BY txn_count DESC, t.account ASC`
    );
    res.json({ rows: rowsRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
