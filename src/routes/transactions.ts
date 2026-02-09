import { Router } from "express";
import { query } from "../db.js";
import { startCategorizeJob, getCategorizeJob } from "../services/categorizeJob.js";
import { syncCategorizedTransactions } from "../services/transactionSync.js";
import { startSyncJob, getSyncJob } from "../services/syncJob.js";

export const transactionsRouter = Router();

transactionsRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  try {
    const totalRes = await query("SELECT COUNT(*)::int as count FROM qbo_transaction_list_rows");
    const rowsRes = await query(
      `SELECT id, txn_id, txn_date, txn_type, doc_num, name, account, amount,
              ai_category, ai_confidence, ai_status, qb_sync_status
       FROM qbo_transaction_list_rows
       ORDER BY txn_date DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      total: totalRes.rows[0]?.count ?? 0,
      limit,
      offset,
      rows: rowsRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

transactionsRouter.post("/categorize", async (req, res) => {
  const limit = Math.min(Number(req.body?.limit ?? 200), 500);
  try {
    const job = await startCategorizeJob(limit);
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

transactionsRouter.get("/categorize/status", (_req, res) => {
  res.json({ ok: true, job: getCategorizeJob() });
});

transactionsRouter.post("/sync", async (req, res) => {
  const limit = Math.min(Number(req.body?.limit ?? 50), 200);
  try {
    const job = await startSyncJob(limit);
    res.json({ ok: true, job });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

transactionsRouter.get("/sync/status", (_req, res) => {
  res.json({ ok: true, job: getSyncJob() });
});

transactionsRouter.get("/sync/failures", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 50);
  try {
    const rowsRes = await query(
      `SELECT txn_date, txn_type, name, account, amount, qb_sync_error
       FROM qbo_transaction_list_rows
       WHERE qb_sync_status = 'failed'
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ rows: rowsRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
