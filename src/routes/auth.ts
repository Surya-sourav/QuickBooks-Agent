import { Router } from "express";
import { buildAuthUrl, exchangeCodeForTokens } from "../qbo/oauth.js";
import { saveConnection } from "../qbo/client.js";
import { query } from "../db.js";

export const authRouter = Router();

authRouter.get("/connect", (_req, res) => {
  res.redirect(buildAuthUrl());
});

authRouter.get("/debug", (_req, res) => {
  res.json({
    redirectUri: process.env.QBO_REDIRECT_URI,
    authUrl: buildAuthUrl()
  });
});

authRouter.post("/disconnect", async (req, res) => {
  const purge = req.query.purge === "1" || req.body?.purge === true;
  try {
    await query("DELETE FROM qbo_connection");
    if (purge) {
      await query("TRUNCATE qbo_customers, qbo_payments, qbo_journal_entries, qbo_transaction_list_rows");
    }
    res.json({ ok: true, purged: purge });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

authRouter.get("/callback", async (req, res) => {
  const code = req.query.code?.toString();
  const realmId = req.query.realmId?.toString();

  if (!code || !realmId) {
    return res.status(400).send("Missing code or realmId");
  }

  try {
    const token = await exchangeCodeForTokens(code);
    const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + (token.x_refresh_token_expires_in ?? 0) * 1000);

    await saveConnection({
      realmId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt,
      refreshTokenExpiresAt
    });

    res.redirect("/");
  } catch (err: any) {
    res.status(500).send(`Auth failed: ${err.message}`);
  }
});
