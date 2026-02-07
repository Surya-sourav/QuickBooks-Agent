import { Router } from "express";
import { buildAuthUrl, exchangeCodeForTokens } from "../qbo/oauth.js";
import { saveConnection } from "../qbo/client.js";
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
    }
    catch (err) {
        res.status(500).send(`Auth failed: ${err.message}`);
    }
});
