import { config, qboApiBase } from "../config.js";
import { query, withClient } from "../db.js";
import { refreshAccessToken } from "./oauth.js";
export const getConnection = async () => {
    const res = await query("SELECT * FROM qbo_connection ORDER BY id DESC LIMIT 1");
    return res.rows[0] ?? null;
};
export const saveConnection = async (input) => {
    const { realmId, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt } = input;
    await withClient(async (client) => {
        const existing = await client.query("SELECT id FROM qbo_connection ORDER BY id DESC LIMIT 1");
        if (existing.rows[0]) {
            await client.query("UPDATE qbo_connection SET realm_id=$1, environment=$2, access_token=$3, refresh_token=$4, access_token_expires_at=$5, refresh_token_expires_at=$6, updated_at=NOW() WHERE id=$7", [realmId, config.qbo.environment, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, existing.rows[0].id]);
        }
        else {
            await client.query("INSERT INTO qbo_connection (realm_id, environment, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at) VALUES ($1,$2,$3,$4,$5,$6)", [realmId, config.qbo.environment, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt]);
        }
    });
};
const isExpired = (iso, skewMs = 60_000) => {
    const exp = new Date(iso).getTime();
    return Date.now() + skewMs >= exp;
};
export const ensureAccessToken = async () => {
    const conn = await getConnection();
    if (!conn) {
        throw new Error("QuickBooks connection not configured. Connect via /api/auth/connect.");
    }
    if (!isExpired(conn.access_token_expires_at)) {
        return conn;
    }
    const refreshed = await refreshAccessToken(conn.refresh_token);
    const accessTokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + (refreshed.x_refresh_token_expires_in ?? 0) * 1000);
    await saveConnection({
        realmId: conn.realm_id,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        accessTokenExpiresAt,
        refreshTokenExpiresAt
    });
    return {
        ...conn,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        access_token_expires_at: accessTokenExpiresAt.toISOString(),
        refresh_token_expires_at: refreshTokenExpiresAt.toISOString()
    };
};
export const qboGet = async (path, params) => {
    const conn = await ensureAccessToken();
    const url = new URL(`${qboApiBase}${path}`);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }
    const res = await fetch(url.toString(), {
        headers: {
            "Authorization": `Bearer ${conn.access_token}`,
            "Accept": "application/json"
        }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`QBO request failed: ${res.status} ${text}`);
    }
    return res.json();
};
export const qboQuery = async (realmId, queryString) => {
    return qboGet(`/v3/company/${realmId}/query`, {
        query: queryString,
        minorversion: config.qbo.minorVersion
    });
};
export const qboReport = async (realmId, report, params) => {
    return qboGet(`/v3/company/${realmId}/reports/${report}`, {
        minorversion: config.qbo.minorVersion,
        ...params
    });
};
