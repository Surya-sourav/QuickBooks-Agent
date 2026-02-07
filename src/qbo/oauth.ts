import { config, qboAuthBase, qboTokenUrl } from "../config.js";

export const buildAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: config.qbo.clientId,
    scope: config.qbo.scopes.join(" "),
    redirect_uri: config.qbo.redirectUri,
    response_type: "code",
    state: "qbo_single_tenant"
  });
  return `${qboAuthBase}/connect/oauth2?${params.toString()}`;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type: string;
};

const tokenRequest = async (body: URLSearchParams): Promise<TokenResponse> => {
  const auth = Buffer.from(`${config.qbo.clientId}:${config.qbo.clientSecret}`).toString("base64");
  const res = await fetch(qboTokenUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: body.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
};

export const exchangeCodeForTokens = async (code: string): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.qbo.redirectUri
  });
  return tokenRequest(body);
};

export const refreshAccessToken = async (refreshToken: string): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  return tokenRequest(body);
};
