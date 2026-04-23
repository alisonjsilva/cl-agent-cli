import { CLAccount, Config, EnvironmentType } from "./schema.js";

export function getActiveAccount(cfg: Config): CLAccount | null {
  if (!cfg.activeAccount) return null;
  return cfg.accounts[cfg.activeAccount] ?? null;
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
