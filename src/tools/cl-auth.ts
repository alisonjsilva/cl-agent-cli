import { CLAccount } from "../config/schema.js";
import { normalizeEndpoint } from "../config/accounts.js";
import { logSecurityEvent } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const MAX_TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours cap
const EXPIRY_BUFFER_MS = 60_000;

/** Per-account token cache keyed by {endpoint, clientId, scope}. */
const tokenCache = new Map<string, CachedToken>();

/** In-flight auth promises to prevent concurrent token stampedes. */
const inflightAuth = new Map<string, Promise<string>>();

const authLimiter = new RateLimiter(5, 60_000); // 5 auth requests per minute

function cacheKey(account: CLAccount): string {
  const ep = normalizeEndpoint(account.baseEndpoint);
  return `${ep}|${account.clientId ?? ""}|${account.scope ?? ""}`;
}

export async function getAccessToken(account: CLAccount): Promise<string> {
  if (account.accessToken) return account.accessToken;

  const key = cacheKey(account);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  // Deduplicate concurrent refresh requests for the same account
  const inflight = inflightAuth.get(key);
  if (inflight) return inflight;

  const promise = fetchToken(account, key);
  inflightAuth.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightAuth.delete(key);
  }
}

async function fetchToken(account: CLAccount, key: string): Promise<string> {
  if (!account.clientId) {
    throw new Error("Account requires either accessToken or clientId for OAuth.");
  }

  await authLimiter.acquire();

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
    logSecurityEvent("oauth_failure", `status=${res.status} endpoint=${authUrl} body=${text}`);
    throw new Error(`CL OAuth failed (${res.status}). Check credentials and endpoint configuration.`);
  }

  const data = (await res.json()) as TokenResponse;
  const serverExpiry = (data.created_at + data.expires_in) * 1000;

  tokenCache.set(key, {
    token: data.access_token,
    expiresAt: Math.min(serverExpiry, Date.now() + MAX_TOKEN_LIFETIME_MS),
  });

  return data.access_token;
}

export function clearTokenCache(): void {
  tokenCache.clear();
  inflightAuth.clear();
}

export function isTokenExpired(account: CLAccount): boolean {
  const cached = tokenCache.get(cacheKey(account));
  if (!cached) return true;
  return Date.now() >= cached.expiresAt - EXPIRY_BUFFER_MS;
}

export async function refreshIfNeeded(account: CLAccount): Promise<string> {
  if (isTokenExpired(account) && !account.accessToken) {
    tokenCache.delete(cacheKey(account));
  }
  return getAccessToken(account);
}
