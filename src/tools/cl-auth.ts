import { CLAccount } from "../config/schema.js";
import { normalizeEndpoint } from "../config/accounts.js";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(account: CLAccount): Promise<string> {
  if (account.accessToken) return account.accessToken;

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  if (!account.clientId) {
    throw new Error("Account requires either accessToken or clientId for OAuth.");
  }

  const endpoint = normalizeEndpoint(account.baseEndpoint);
  const slug = new URL(endpoint).hostname.split(".")[0];
  const authUrl = `https://auth.commercelayer.io/oauth/token`;

  const body: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: account.clientId,
  };

  if (account.clientSecret) {
    body.client_secret = account.clientSecret;
  }
  if (account.scope) {
    body.scope = account.scope;
  }

  const res = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CL OAuth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: (data.created_at + data.expires_in) * 1000,
  };

  return data.access_token;
}

export function clearTokenCache(): void {
  cachedToken = null;
}

export function isTokenExpired(): boolean {
  if (!cachedToken) return true;
  return Date.now() >= cachedToken.expiresAt - 60_000;
}

export async function refreshIfNeeded(account: CLAccount): Promise<string> {
  if (isTokenExpired() && !account.accessToken) {
    clearTokenCache();
  }
  return getAccessToken(account);
}
