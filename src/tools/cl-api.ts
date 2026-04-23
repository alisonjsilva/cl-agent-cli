import { CLAccount } from "../config/schema.js";
import { normalizeEndpoint, validateEndpoint } from "../config/accounts.js";
import { getAccessToken } from "./cl-auth.js";
import { RateLimiter } from "../utils/rate-limiter.js";

interface JsonApiResponse {
  data: Record<string, unknown> | Record<string, unknown>[];
  meta?: { record_count?: number; page_count?: number };
  included?: Record<string, unknown>[];
}

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1000;
const apiLimiter = new RateLimiter(60, 60_000); // 60 requests per minute

function retryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  // Honour Retry-After header when present
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  // Exponential backoff with jitter
  const base = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * base * 0.5;
  return base + jitter;
}

export async function clFetch(
  account: CLAccount,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<JsonApiResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await apiLimiter.acquire();
      const token = await getAccessToken(account);
      const base = normalizeEndpoint(account.baseEndpoint);
      validateEndpoint(base, account.allowCustomEndpoint);
      const url = `${base}/api/${path}`;

      const res = await fetch(url, {
        method: options?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/vnd.api+json",
          Accept: "application/vnd.api+json",
        },
        ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      });

      if (res.status === 429 || (res.status >= 500 && attempt < MAX_RETRIES)) {
        const text = await res.text();
        lastError = new Error(`CL API ${res.status}: ${text.slice(0, 200)}`);
        await delay(retryDelayMs(attempt, res.headers.get("Retry-After")));
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`CL API ${res.status}: ${text.slice(0, 300)}`);
      }

      if (res.status === 204) return { data: {} };
      return (await res.json()) as JsonApiResponse;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("CL API")) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await delay(retryDelayMs(attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error("CL API request failed");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatResource(data: Record<string, unknown>): string {
  const attrs = (data.attributes ?? {}) as Record<string, unknown>;
  const id = data.id ?? "";
  const type = data.type ?? "";
  const lines: string[] = [`${type} (${id})`, "─".repeat(30)];

  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") continue;
    lines.push(`  ${k}: ${v}`);
  }

  return lines.join("\n");
}

export function formatList(
  data: Record<string, unknown>[],
  meta?: { record_count?: number },
): string {
  if (data.length === 0) return "No results found.";
  const parts = data.map(formatResource);
  const header = meta?.record_count != null
    ? `Found ${meta.record_count} total (showing ${data.length}):`
    : `Showing ${data.length} results:`;
  return [header, "", ...parts].join("\n\n");
}

export function buildQuery(params: {
  pageSize?: number;
  pageNumber?: number;
  sort?: string;
  filters?: Record<string, string>;
}): string {
  const qs: string[] = [];
  if (params.pageSize) qs.push(`page[size]=${params.pageSize}`);
  if (params.pageNumber) qs.push(`page[number]=${params.pageNumber}`);
  if (params.sort) qs.push(`sort=${params.sort}`);
  if (params.filters) {
    for (const [k, v] of Object.entries(params.filters)) {
      qs.push(`filter[q][${k}]=${encodeURIComponent(v)}`);
    }
  }
  return qs.length > 0 ? `?${qs.join("&")}` : "";
}
