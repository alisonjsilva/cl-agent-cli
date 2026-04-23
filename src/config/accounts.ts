import { CLAccount, Config, EnvironmentType } from "./schema.js";
import { logSecurityEvent } from "../utils/logger.js";

const ALLOWED_DOMAINS = [".commercelayer.io", ".commercelayer.co"];

export function getActiveAccount(cfg: Config): CLAccount | null {
  if (!cfg.activeAccount) return null;
  return cfg.accounts[cfg.activeAccount] ?? null;
}

/**
 * Returns true if the hostname belongs to a known Commerce Layer domain.
 */
export function isAllowedEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return ALLOWED_DOMAINS.some((d) => parsed.hostname.endsWith(d));
  } catch {
    return false;
  }
}

/**
 * Validates an endpoint URL for security.
 * Throws if the endpoint is not HTTPS, contains credentials, or targets
 * an unknown domain (unless the account opts in via `allowCustomEndpoint`).
 */
export function validateEndpoint(endpoint: string, allowCustom?: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`Invalid endpoint URL: ${endpoint}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Endpoint must use HTTPS: ${endpoint}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error("Endpoint must not contain embedded credentials.");
  }

  if (!isAllowedEndpoint(endpoint) && !allowCustom) {
    logSecurityEvent("blocked_endpoint", `hostname=${parsed.hostname}`);
    throw new Error(
      `Endpoint "${parsed.hostname}" is not a recognized Commerce Layer domain. ` +
      `Set "allowCustomEndpoint": true on the account to override.`,
    );
  }
}

export function normalizeEndpoint(raw: string): string {
  let ep = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(ep)) {
    ep = `https://${ep}`;
  }
  try {
    const url = new URL(ep);
    if (!url.hostname.includes(".")) {
      ep = `https://${url.hostname}.commercelayer.io`;
    }
    // Strip path/query/fragment — keep origin only
    const normalized = new URL(ep);
    ep = normalized.origin;
  } catch {
    const slug = ep.replace(/^https?:\/\//i, "");
    ep = `https://${slug}.commercelayer.io`;
  }
  return ep;
}

export function detectEnvironment(account: CLAccount): EnvironmentType {
  if (account.environment) return account.environment;

  const ep = account.baseEndpoint.toLowerCase();
  if (ep.includes("staging") || ep.includes("stg")) return "staging";
  if (ep.includes("test") || ep.includes("sandbox") || ep.includes("dev")) return "test";
  return "production";
}

export function accountEnv(acc: CLAccount): Record<string, string> {
  const env: Record<string, string> = {
    CL_BASE_ENDPOINT: normalizeEndpoint(acc.baseEndpoint),
  };
  if (acc.accessToken) env.CL_ACCESS_TOKEN = acc.accessToken;
  if (acc.clientId) env.CL_CLIENT_ID = acc.clientId;
  if (acc.clientSecret) env.CL_CLIENT_SECRET = acc.clientSecret;
  if (acc.scope) env.CL_SCOPE = acc.scope;
  return env;
}

export function slugFromEndpoint(endpoint: string): string {
  try {
    const url = new URL(normalizeEndpoint(endpoint));
    return url.hostname.split(".")[0];
  } catch {
    return endpoint;
  }
}
