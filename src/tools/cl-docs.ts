import { tool, type ToolSet } from "ai";
import { z } from "zod";

const DOCS_BASE = "https://docs.commercelayer.io";
const INDEX_URL = `${DOCS_BASE}/llms.txt`;

// Page-level content is capped to avoid token overuse.
const MAX_PAGE_CHARS = 4_000;
// Maximum number of pages we fetch per query.
const MAX_PAGES_TO_FETCH = 2;
// Index TTL: 1 hour.
const INDEX_TTL_MS = 60 * 60 * 1000;

interface IndexEntry {
  title: string;
  url: string;
}

interface IndexCache {
  entries: IndexEntry[];
  fetchedAt: number;
}

let indexCache: IndexCache | null = null;

async function fetchWithTimeout(url: string, timeoutMs = 8_000): Promise<string> {
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
 * Parse the llms.txt index. Lines can be:
 *   - Markdown links: [Title](https://...)
 *   - Plain URLs: https://...
 *   - Section headers / descriptions (ignored)
 */
function parseIndex(text: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = mdLinkRe.exec(text)) !== null) {
    entries.push({ title: match[1].trim(), url: match[2].trim() });
  }

  // Fallback: bare URLs not wrapped in markdown links
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
  const text = await fetchWithTimeout(INDEX_URL);
  const entries = parseIndex(text);
  indexCache = { entries, fetchedAt: now };
  return entries;
}

/**
 * Score an entry against the query tokens. Higher = more relevant.
 * Simple TF-style scoring: count how many query words appear in the title/URL.
 */
function scoreEntry(entry: IndexEntry, tokens: string[]): number {
  const haystack = (entry.title + " " + entry.url).toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

/**
 * Convert a docs page URL to its markdown equivalent by appending .md
 * Commerce Layer docs support this natively per their docs.
 */
function toMarkdownUrl(url: string): string {
  // Strip trailing slash before appending .md
  const clean = url.replace(/\/$/, "");
  if (clean.endsWith(".md")) return clean;
  return `${clean}.md`;
}

/**
 * Truncate content to MAX_PAGE_CHARS. Tries to cut at a newline boundary.
 */
function truncate(text: string): string {
  if (text.length <= MAX_PAGE_CHARS) return text;
  const cut = text.lastIndexOf("\n", MAX_PAGE_CHARS);
  const end = cut > MAX_PAGE_CHARS / 2 ? cut : MAX_PAGE_CHARS;
  return text.slice(0, end) + "\n\n[… truncated for brevity]";
}

export function createDocsTools(): ToolSet {
  const tools: ToolSet = {};

  tools.cl_search_docs = tool({
    description:
      "Search the official Commerce Layer documentation for any topic, resource type, operation, or how-to. " +
      "Use this whenever you are unsure how an API works, how to perform an action (e.g. delete a resource with associations, manage relationships, use a specific attribute), " +
      "or when a user explicitly asks about documentation. Returns relevant doc page content in markdown.",
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .max(200)
        .describe(
          "Search query — describe what you need to know. E.g. 'delete sku with associated prices', 'disassociate order from customer', 'how to void an authorization'",
        ),
    }),
    execute: async ({ query }) => {
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
        .replace(/[^a-z0-9\s-_]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2);

      const scored = entries
        .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_PAGES_TO_FETCH);

      if (scored.length === 0) {
        return (
          `No documentation pages matched your query "${query}". ` +
          `Try broader terms or visit: ${DOCS_BASE}`
        );
      }

      const results: string[] = [];

      for (const { entry } of scored) {
        const mdUrl = toMarkdownUrl(entry.url);
        try {
          const content = await fetchWithTimeout(mdUrl, 10_000);
          results.push(`## ${entry.title}\nSource: ${entry.url}\n\n${truncate(content)}`);
        } catch (err) {
          results.push(`## ${entry.title}\nSource: ${entry.url}\n\n[Could not fetch page: ${err instanceof Error ? err.message : String(err)}]`);
        }
      }

      return results.join("\n\n---\n\n");
    },
  });

  return tools;
}
