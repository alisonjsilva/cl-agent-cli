import { tool, type ToolSet } from "ai";
import { z } from "zod";

const DOCS_BASE = "https://docs.commercelayer.io";
const INDEX_URL = `${DOCS_BASE}/llms.txt`;
// Entry point used for the ?ask= semantic search endpoint.
const ASK_BASE_URL = `${DOCS_BASE}/readme.md`;

// How long to wait for the ?ask= endpoint before falling back.
// The endpoint does server-side AI processing and can take 30–90+ seconds
// on a cold start; we cap it to keep the TUI responsive.
const ASK_TIMEOUT_MS = 20_000;

// Module-level flag — updated instantly by setDocsAskEnabled() without
// needing to rebuild the tool registry.
let _askEnabled = true;

/**
 * Toggle the ?ask= semantic search path at runtime.
 * Called by the registry on startup and by /docs command for live toggling.
 */
export function setDocsAskEnabled(enabled: boolean): void {
  _askEnabled = enabled;
}

export function getDocsAskEnabled(): boolean {
  return _askEnabled;
}

// Page-level content is capped to avoid token overuse in fallback mode.
const MAX_PAGE_CHARS = 4_000;
// How many top candidates to attempt before giving up in fallback mode.
const MAX_CANDIDATES = 8;
// How many successful page fetches to return.
const MAX_RESULTS = 2;
// Index TTL: 1 hour.
const INDEX_TTL_MS = 60 * 60 * 1000;
// How long to remember a URL that returned a dead/not-found page.
const DEAD_URL_TTL_MS = 5 * 60 * 1000;

interface IndexEntry {
  title: string;
  url: string;
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
 * Strip the "# Sources:" section from an ?ask= response.
 * It is mostly GitHub SDK commit links — noise for the agent.
 */
function stripSources(text: string): string {
  const sourcesIdx = text.search(/^#\s*Sources:/im);
  if (sourcesIdx === -1) return text.trim();
  return text.slice(0, sourcesIdx).trim();
}

/**
 * Try the ?ask= semantic endpoint. Returns the answer string on success,
 * or throws if the request times out or returns an error.
 */
async function askDocs(query: string): Promise<string> {
  const url = `${ASK_BASE_URL}?ask=${encodeURIComponent(query)}`;
  const raw = await fetchWithTimeout(url, ASK_TIMEOUT_MS);
  const answer = stripSources(raw);
  if (!answer) throw new Error("Empty answer from ?ask= endpoint");
  return answer;
}

// ── Fallback: index-based keyword search ────────────────────────────────────

function parseIndex(text: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdLinkRe.exec(text)) !== null) {
    entries.push({ title: match[1].trim(), url: match[2].trim() });
  }
  if (entries.length === 0) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("https://")) {
        entries.push({ title: trimmed, url: trimmed });
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

function scoreEntry(entry: IndexEntry, tokens: string[]): number {
  const haystack = (entry.title + " " + entry.url).toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
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

async function fallbackSearch(query: string): Promise<string> {
  let entries: IndexEntry[];
  try {
    entries = await getIndex();
  } catch (err) {
    return `Could not fetch documentation index: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (entries.length === 0) {
    return "Documentation index is empty or could not be parsed.";
  }

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  // Take the top MAX_CANDIDATES candidates; skip generic index pages, dead
  // URLs, and pages whose content doesn't actually match the query.
  const candidates = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter(({ score, entry }) => score > 0 && !isExcludedUrl(entry.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    return (
      `No documentation pages matched "${query}". ` +
      `Do not retry — use your own knowledge of the Commerce Layer REST API ` +
      `or visit ${DOCS_BASE} for reference.`
    );
  }

  const results: string[] = [];

  for (const { entry } of candidates) {
    if (results.length >= MAX_RESULTS) break;

    const mdUrl = toMarkdownUrl(entry.url);

    // Skip URLs already confirmed dead in this session.
    if (isDead(mdUrl)) continue;

    try {
      const content = await fetchWithTimeout(mdUrl, 10_000);

      if (isDeadContent(content) || !isRelevantContent(content, tokens)) {
        markDead(mdUrl);
        continue;
      }

      results.push(`## ${entry.title}\nSource: ${entry.url}\n\n${truncate(content)}`);
    } catch {
      markDead(mdUrl);
    }
  }

  if (results.length === 0) {
    const titles = candidates
      .slice(0, 4)
      .map(({ entry }) => `  • ${entry.title} — ${entry.url}`)
      .join("\n");
    return (
      `No live documentation pages found for "${query}" (all candidates returned 404 or empty content).\n` +
      `Closest index matches were:\n${titles}\n\n` +
      `Do not retry with rephrased queries. Apply your knowledge of the Commerce Layer REST API or ` +
      `tell the user you could not find specific documentation.`
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
      "or when a user explicitly asks about documentation. Returns relevant doc content in markdown.",
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
      // Primary path: semantic ?ask= endpoint — returns a pre-distilled answer
      // (~150 tokens) that is far more relevant than raw page markdown.
      // Falls back to keyword index search when the endpoint times out (>20 s)
      // or when docsAskEnabled is false.
      if (_askEnabled) {
        try {
          return await askDocs(query);
        } catch {
          // ?ask= timed out or failed — fall back silently.
        }
      }
      return await fallbackSearch(query);
    },
  });

  return tools;
}
