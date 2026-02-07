import crypto from "node:crypto";
import { config } from "../config";
import { db } from "../db";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
};

type QboConnection = {
  id: number;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_token_expires_at: string | null;
};

const AUTHORIZATION_ENDPOINT = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthorizationUrl(state: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.qbo.clientId);
  url.searchParams.set("redirect_uri", config.qbo.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.qbo.scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function saveState(state: string): Promise<void> {
  await db.query("insert into auth_states(state) values ($1) on conflict do nothing", [state]);
}

export async function consumeState(state: string): Promise<boolean> {
  const result = await db.query("delete from auth_states where state = $1 returning state", [state]);
  return result.rowCount > 0;
}

function basicAuthHeader(): string {
  const credentials = `${config.qbo.clientId}:${config.qbo.clientSecret}`;
  return Buffer.from(credentials).toString("base64");
}

async function exchangeToken(params: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuthHeader()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: params.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function exchangeAuthCode(code: string, realmId: string): Promise<void> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.qbo.redirectUri
  });

  const tokenResponse = await exchangeToken(params);
  await upsertConnection(realmId, tokenResponse);
}

export async function refreshAccessToken(connection: QboConnection): Promise<QboConnection> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refresh_token
  });

  const tokenResponse = await exchangeToken(params);
  await upsertConnection(connection.realm_id, tokenResponse);
  return getConnection(connection.realm_id);
}

function toExpiresAt(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

async function upsertConnection(realmId: string, tokenResponse: TokenResponse): Promise<void> {
  const expiresAt = toExpiresAt(tokenResponse.expires_in);
  const refreshExpiresAt = tokenResponse.x_refresh_token_expires_in
    ? toExpiresAt(tokenResponse.x_refresh_token_expires_in)
    : null;

  await db.query(
    `insert into qbo_connection (realm_id, access_token, refresh_token, expires_at, refresh_token_expires_at)
     values ($1, $2, $3, $4, $5)
     on conflict (realm_id)
     do update set access_token = excluded.access_token,
                   refresh_token = excluded.refresh_token,
                   expires_at = excluded.expires_at,
                   refresh_token_expires_at = excluded.refresh_token_expires_at,
                   updated_at = now()`,
    [realmId, tokenResponse.access_token, tokenResponse.refresh_token, expiresAt, refreshExpiresAt]
  );
}

export async function getConnection(realmId?: string): Promise<QboConnection> {
  const result = realmId
    ? await db.query("select * from qbo_connection where realm_id = $1", [realmId])
    : await db.query("select * from qbo_connection order by updated_at desc limit 1");

  if (result.rowCount === 0) {
    throw new Error("QuickBooks connection not found. Connect your account first.");
  }

  return result.rows[0] as QboConnection;
}

function isExpiringSoon(connection: QboConnection): boolean {
  const expiresAt = new Date(connection.expires_at).getTime();
  return Date.now() + 2 * 60 * 1000 >= expiresAt;
}

export async function getAccessToken(realmId?: string): Promise<{ realmId: string; accessToken: string }> {
  let connection = await getConnection(realmId);
  if (isExpiringSoon(connection)) {
    connection = await refreshAccessToken(connection);
  }
  return { realmId: connection.realm_id, accessToken: connection.access_token };
}

export async function qboFetch(path: string, init?: RequestInit): Promise<any> {
  const { realmId, accessToken } = await getAccessToken();
  const url = new URL(`${config.qbo.baseUrl}/v3/company/${realmId}/${path}`);
  if (config.qbo.minorVersion) {
    url.searchParams.set("minorversion", config.qbo.minorVersion);
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QuickBooks API error (${response.status}): ${text}`);
  }

  return response.json();
}
