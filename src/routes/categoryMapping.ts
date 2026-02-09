import { Router } from "express";
import { config } from "../config.js";
import { query } from "../db.js";
import { autoGenerateMappings } from "../services/categoryMapping.js";

export const categoryMappingRouter = Router();

categoryMappingRouter.get("/", async (_req, res) => {
  try {
    const categories = config.ai.transactionCategories;
    const mappingRes = await query(
      "SELECT category, account_id, account_name FROM ai_category_account_map"
    );
    const accountsRes = await query(
      `SELECT qbo_id, name, account_type, account_sub_type, classification
       FROM qbo_accounts
       ORDER BY name ASC`
    );

    res.json({
      categories,
      mappings: mappingRes.rows,
      accounts: accountsRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

categoryMappingRouter.post("/", async (req, res) => {
  const category = req.body?.category?.toString();
  const accountId = req.body?.accountId?.toString();
  if (!category || !accountId) {
    return res.status(400).json({ error: "Missing category or accountId" });
  }

  try {
    const accountRes = await query(
      "SELECT name FROM qbo_accounts WHERE qbo_id = $1",
      [accountId]
    );
    const accountName = accountRes.rows[0]?.name ?? null;
    await query(
      `INSERT INTO ai_category_account_map (category, account_id, account_name)
       VALUES ($1,$2,$3)
       ON CONFLICT (category) DO UPDATE SET
         account_id=EXCLUDED.account_id,
         account_name=EXCLUDED.account_name,
         updated_at=NOW()`,
      [category, accountId, accountName]
    );

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

categoryMappingRouter.post("/auto", async (_req, res) => {
  try {
    const categories = config.ai.transactionCategories;
    const result = await autoGenerateMappings(categories);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
