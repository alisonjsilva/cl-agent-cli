import { tool, type ToolSet } from "ai";
import { z } from "zod";

const DOCS_BASE = "https://docs.commercelayer.io";
const INDEX_URL = `${DOCS_BASE}/llms.txt`;

// Official Commerce Layer docs MCP endpoint (streamable HTTP / JSON-RPC).
// Exposes two tools: `searchDocumentation` and `getPage`.
// See: https://docs.commercelayer.io/#mcp-server
const MCP_URL = `${DOCS_BASE}/~gitbook/mcp`;

// Timeouts — the MCP search is the primary path and is normally fast (<5 s).
const MCP_TIMEOUT_MS = 15_000;

// Module-level flag — retained for backward compatibility with existing
// /docs command. When true (default), the MCP path is used; when false,
// the agent goes straight to the local keyword/URL fallback.
let _mcpEnabled = true;

/**
 * Toggle the MCP search path at runtime.
 * Called by the registry on startup and by /docs command for live toggling.
 */
export function setDocsAskEnabled(enabled: boolean): void {
  _mcpEnabled = enabled;
}

export function getDocsAskEnabled(): boolean {
  return _mcpEnabled;
}

// Page-level content is capped to avoid token overuse in fallback mode.
const MAX_PAGE_CHARS = 4_000;
// How many top candidates to attempt before giving up in fallback mode.
const MAX_CANDIDATES = 10;
// How many successful page fetches to return.
const MAX_RESULTS = 2;
// Index TTL: 1 hour.
const INDEX_TTL_MS = 60 * 60 * 1000;
// How long to remember a URL that returned a dead/not-found page.
const DEAD_URL_TTL_MS = 5 * 60 * 1000;

// English stop words — they appear on every doc page and degrade scoring.
const STOP_WORDS = new Set([
  "the", "how", "can", "what", "does", "this", "that", "with", "for", "from",
  "into", "about", "which", "when", "where", "who", "will", "would", "could",
  "should", "have", "has", "had", "are", "was", "were", "been", "being", "its",
  "you", "your", "they", "them", "their", "use", "using", "via", "api",
  "commerce", "layer", "and", "all", "any", "also", "not", "but", "way",
]);

// Known Commerce Layer API resource URL slugs for direct URL construction.
// Longest first so multi-word slugs match before single-word ones.
const CL_RESOURCE_SLUGS: readonly string[] = [
  "percentage_discount_promotions", "free_shipping_promotions",
  "free_gift_promotions", "fixed_price_promotions",
  "buy_x_pay_y_promotions", "external_promotions",
  "customer_payment_sources", "customer_subscriptions",
  "customer_password_resets", "customer_addresses",
  "inventory_stock_locations", "inventory_return_locations",
  "order_subscriptions", "order_copies", "order_factories",
  "return_line_items", "parcel_line_items", "stock_line_items",
  "shipping_categories", "shipping_methods", "shipping_zones",
  "inventory_models", "stock_locations", "stock_transfers",
  "stock_items", "customer_groups", "flex_promotions",
  "payment_methods", "payment_options", "price_lists",
  "gift_cards", "line_items",
  "stripe_gateways", "stripe_payments",
  "adyen_gateways", "adyen_payments",
  "paypal_gateways", "paypal_payments",
  "braintree_gateways", "braintree_payments",
  "external_gateways", "external_payments",
  "manual_gateways", "reserved_stocks",
  "orders", "skus", "customers", "shipments", "returns",
  "prices", "markets", "promotions", "coupons", "authorizations",
  "captures", "refunds", "voids", "transactions", "imports",
  "exports", "webhooks", "merchants", "bundles", "tags",
  "attachments", "parcels", "packages", "cleanups", "links",
  "notifications", "addresses", "stores",
] as const;

// Action verbs that map to CRUD sub-page slugs.
const ACTION_SLUGS: Record<string, string> = {
  create: "create", delete: "delete", remove: "delete", destroy: "delete",
  update: "update", edit: "update", modify: "update", patch: "update",
  list: "list", fetch: "list", get: "retrieve", retrieve: "retrieve",
  find: "retrieve",
};

interface IndexEntry {
  title: string;
  url: string;
  description: string;
}

interface IndexCache {
  entries: IndexEntry[];
  fetchedAt: number;
}

let indexCache: IndexCache | null = null;

// URLs confirmed dead (404 / "does not exist" content) — skip without fetching.
const deadUrls = new Map<string, number>(); // url → markedDeadAt

function markDead(url: string): void {
  deadUrls.set(url, Date.now());
}

function isDead(url: string): boolean {
  const t = deadUrls.get(url);
  if (!t) return false;
  if (Date.now() - t > DEAD_URL_TTL_MS) {
    deadUrls.delete(url);
    return false;
  }
  return true;
}

/** Returns true when the fetched page content is a "not found" placeholder. */
function isDeadContent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("this page may have been moved") ||
    lower.includes("page not found") ||
    lower.includes("404") ||
    text.trim().length < 80
  );
}

/**
 * Generic landing/index pages that match every query due to broad coverage.
 * Exclude them from keyword fallback results.
 */
const EXCLUDED_URL_RE = /\/(readme|index)(\.md)?$/i;

function isExcludedUrl(url: string): boolean {
  return EXCLUDED_URL_RE.test(url);
}

/**
 * Returns true if the fetched content is actually relevant to the query.
 * Requires at least 1 of the meaningful query tokens to appear in the content.
 * Prevents generic landing pages (which pass isDeadContent) from being returned.
 */
function isRelevantContent(content: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const lower = content.toLowerCase();
  return tokens.some((t) => lower.includes(t));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip the "# Sources:" section from a docs response.
 * It is mostly GitHub SDK commit links — noise for the agent.
 */
function stripSources(text: string): string {
  const sourcesIdx = text.search(/^#\s*Sources:/im);
  if (sourcesIdx === -1) return text.trim();
  return text.slice(0, sourcesIdx).trim();
}

// ── MCP (streamable HTTP / JSON-RPC) primary search path ───────────────────

let _mcpRequestId = 0;

/**
 * Parse a streamable-HTTP MCP response. The server replies in SSE format:
 *   event: message
 *   data: {"jsonrpc":"2.0","id":N,"result":{...}}
 * For convenience we also accept a plain JSON body.
 */
function parseMCPResponse(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  // SSE: pick the first `data:` line.
  for (const line of trimmed.split(/\r?\n/)) {
    const m = line.match(/^data:\s*(.+)$/);
    if (m) return JSON.parse(m[1]);
  }
  throw new Error("Empty or unparseable MCP response");
}

/** POST a JSON-RPC tools/call request to the CL docs MCP. */
async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++_mcpRequestId,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parseMCPResponse(text) as {
      result?: {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
      error?: { message?: string };
    };
    if (parsed.error) throw new Error(parsed.error.message ?? "MCP error");
    if (parsed.result?.isError) throw new Error("MCP tool returned isError");
    const parts = (parsed.result?.content ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string);
    const out = parts.join("\n\n").trim();
    if (!out) throw new Error("Empty MCP response");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Primary search path: call the official CL docs MCP `searchDocumentation`
 * tool. Returns curated, ranked excerpts with source links.
 */
async function searchDocsMCP(query: string): Promise<string> {
  return stripSources(await callMCPTool("searchDocumentation", { query }, MCP_TIMEOUT_MS));
}

/**
 * Fetch the full markdown content of a specific documentation page via
 * the CL docs MCP `getPage` tool.
 */
async function getDocPageMCP(url: string): Promise<string> {
  return stripSources(await callMCPTool("getPage", { url }, MCP_TIMEOUT_MS));
}

// ── Fallback: index-based keyword search ────────────────────────────────────

function parseIndex(text: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  // Captures: [Title](URL): Description  —or—  [Title](URL)
  const lineRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)(?::\s*(.+))?/g;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(text)) !== null) {
    entries.push({
      title: match[1].trim(),
      url: match[2].trim(),
      description: (match[3] || "").trim(),
    });
  }
  if (entries.length === 0) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("https://")) {
        entries.push({ title: trimmed, url: trimmed, description: "" });
      }
    }
  }
  return entries;
}

async function getIndex(): Promise<IndexEntry[]> {
  const now = Date.now();
  if (indexCache && now - indexCache.fetchedAt < INDEX_TTL_MS) {
    return indexCache.entries;
  }
  const text = await fetchWithTimeout(INDEX_URL, 8_000);
  const entries = parseIndex(text);
  indexCache = { entries, fetchedAt: now };
  return entries;
}

/** Tokenize query: lowercase, remove punctuation, filter stop words and short tokens. */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreEntry(entry: IndexEntry, tokens: string[]): number {
  const titleLower = entry.title.toLowerCase();
  const urlLower = entry.url.toLowerCase();
  const descLower = entry.description.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (titleLower.includes(token)) score += 3;
    if (urlLower.includes(token)) score += 2;
    if (descLower.includes(token)) score += 1;
  }
  return score;
}

function toMarkdownUrl(url: string): string {
  const clean = url.replace(/\/$/, "");
  return clean.endsWith(".md") ? clean : `${clean}.md`;
}

function truncate(text: string): string {
  if (text.length <= MAX_PAGE_CHARS) return text;
  const cut = text.lastIndexOf("\n", MAX_PAGE_CHARS);
  const end = cut > MAX_PAGE_CHARS / 2 ? cut : MAX_PAGE_CHARS;
  return text.slice(0, end) + "\n\n[… truncated for brevity]";
}

/**
 * Fetch a single doc page, returning its content or null if dead/irrelevant.
 */
async function fetchPageContent(url: string, tokens: string[]): Promise<string | null> {
  if (isDead(url)) return null;
  try {
    const content = await fetchWithTimeout(url, 10_000);
    if (isDeadContent(content) || !isRelevantContent(content, tokens)) {
      markDead(url);
      return null;
    }
    return content;
  } catch {
    markDead(url);
    return null;
  }
}

/**
 * Build direct URL candidates by extracting a resource name and CRUD action
 * from the query.  Returns most-specific URLs first.
 */
function buildDirectResourceUrls(query: string): string[] {
  const lower = query.toLowerCase();
  const urls: string[] = [];

  // Find the first matching resource slug (list is already longest-first).
  let slug: string | null = null;
  for (const s of CL_RESOURCE_SLUGS) {
    if (lower.includes(s) || lower.includes(s.replace(/_/g, " "))) {
      slug = s;
      break;
    }
  }
  // Try singular forms: "order" → "orders", "sku" → "skus"
  if (!slug) {
    for (const s of CL_RESOURCE_SLUGS) {
      const singular = s.replace(/s$/, "");
      if (singular.length > 2 && lower.includes(singular)) {
        slug = s;
        break;
      }
    }
  }

  if (!slug) return urls;

  // Find a matching CRUD action.
  let action: string | null = null;
  for (const [word, act] of Object.entries(ACTION_SLUGS)) {
    if (lower.includes(word)) {
      action = act;
      break;
    }
  }

  // Most-specific first: action page → object definition → resource overview.
  if (action) urls.push(`${DOCS_BASE}/${slug}/${action}.md`);
  urls.push(`${DOCS_BASE}/${slug}/object.md`);
  urls.push(`${DOCS_BASE}/${slug}.md`);

  return urls;
}

async function fallbackSearch(query: string): Promise<string> {
  const tokens = tokenize(query);

  // ── Attempt 1: Index-based search with enhanced scoring ──────────────
  let entries: IndexEntry[] = [];
  try {
    entries = await getIndex();
  } catch {
    // Index unavailable — fall through to direct URL construction.
  }

  const results: string[] = [];

  if (entries.length > 0) {
    const candidates = entries
      .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
      .filter(({ score, entry }) => score > 0 && !isExcludedUrl(entry.url))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    for (const { entry } of candidates) {
      if (results.length >= MAX_RESULTS) break;
      const mdUrl = toMarkdownUrl(entry.url);
      const content = await fetchPageContent(mdUrl, tokens);
      if (content) {
        results.push(`## ${entry.title}\nSource: ${entry.url}\n\n${truncate(content)}`);
      }
    }
  }

  // ── Attempt 2: Direct resource URL construction ──────────────────────
  if (results.length === 0) {
    const directUrls = buildDirectResourceUrls(query);
    for (const url of directUrls) {
      if (results.length >= MAX_RESULTS) break;
      const content = await fetchPageContent(url, tokens);
      if (content) {
        const slug = url.replace(`${DOCS_BASE}/`, "").replace(/\.md$/, "");
        results.push(`## ${slug}\nSource: ${url}\n\n${truncate(content)}`);
      }
    }
  }

  if (results.length === 0) {
    return (
      `No documentation found for "${query}". ` +
      `Do not retry — use your own knowledge of the Commerce Layer REST API ` +
      `or visit ${DOCS_BASE} for reference.`
    );
  }

  return results.join("\n\n---\n\n");
}

// ── Tool export ──────────────────────────────────────────────────────────────

export function createDocsTools(): ToolSet {
  const tools: ToolSet = {};

  tools.cl_search_docs = tool({
    description:
      "Search the official Commerce Layer documentation for any topic, resource type, operation, or how-to. " +
      "Use this whenever you are unsure how an API works, how to perform an action (e.g. delete a resource with associations, manage relationships, use a specific attribute), " +
      "or when a user explicitly asks about documentation. Returns ranked, semantically-relevant doc excerpts in markdown with source URLs. " +
      "If an excerpt is incomplete, follow up with `cl_get_doc_page` using the URL.",
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .max(200)
        .describe(
          "Specific natural-language question. E.g. 'how to delete a sku that has associated prices', 'disassociate order from customer', 'how to void an authorization'",
        ),
    }),
    execute: async ({ query }) => {
      // Primary path: official CL docs MCP — server-side semantic search
      // returns ranked, curated excerpts with source URLs. Far more reliable
      // than scraping markdown pages directly.
      if (_mcpEnabled) {
        try {
          return await searchDocsMCP(query);
        } catch {
          // MCP unreachable / timed out — fall through to local fallback.
        }
      }
      return await fallbackSearch(query);
    },
  });

  tools.cl_get_doc_page = tool({
    description:
      "Fetch the full markdown content of a specific Commerce Layer documentation page. " +
      "Use this after `cl_search_docs` returns a relevant URL but the excerpt is incomplete. " +
      "Accepts full URLs like https://docs.commercelayer.io/skus/delete.",
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .describe("Full URL of the documentation page to fetch."),
    }),
    execute: async ({ url }) => {
      // Only allow URLs on the docs domain to prevent SSRF / tool abuse.
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== "docs.commercelayer.io") {
          return `Refused: only docs.commercelayer.io URLs are allowed (got ${parsed.hostname}).`;
        }
      } catch {
        return `Invalid URL: ${url}`;
      }

      if (_mcpEnabled) {
        try {
          return await getDocPageMCP(url);
        } catch {
          // Fall through to direct markdown fetch.
        }
      }
      // Fallback: append .md and fetch directly.
      const mdUrl = toMarkdownUrl(url);
      try {
        const content = await fetchWithTimeout(mdUrl, 10_000);
        if (isDeadContent(content)) {
          return `Page not found or empty: ${url}`;
        }
        return truncate(content);
      } catch (err) {
        return `Could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });

  return tools;
}
