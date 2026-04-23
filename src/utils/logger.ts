import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { configDir } from "../config/store.js";

const LOG_FILE = path.join(configDir(), "debug.log");
let initialized = false;

function ensureDir(): void {
  if (!initialized) {
    try {
      mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    } catch { /* ignore */ }
    initialized = true;
  }
}

export function debugLog(level: "info" | "warn" | "error", msg: string): void {
  if (!process.env.CL_AGENT_DEBUG && level !== "error") return;
  ensureDir();
  const ts = new Date().toISOString();
  try {
    appendFileSync(LOG_FILE, `[${ts}] ${level.toUpperCase()} ${msg}\n`);
  } catch { /* ignore */ }
}

export function logError(context: string, err: unknown): void {
  const msg = err instanceof Error
    ? `${err.message}\n${err.stack ?? ""}`
    : String(err);
  debugLog("error", `[${context}] ${msg}`);
}

/** Always logs to disk regardless of CL_AGENT_DEBUG — for audit-worthy events. */
export function logSecurityEvent(event: string, details?: string): void {
  ensureDir();
  const ts = new Date().toISOString();
  const sanitized = details ? sanitizeLogOutput(details) : "";
  const line = sanitized
    ? `[${ts}] SECURITY ${event} — ${sanitized}\n`
    : `[${ts}] SECURITY ${event}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch { /* best-effort */ }
}

const SECRET_PATTERNS = [
  /Bearer\s+\S+/gi,
  /sk-[a-zA-Z0-9_-]{10,}/g,
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*/g,
  /client_secret["\s:=]+\S+/gi,
  /access_token["\s:=]+\S+/gi,
];

function sanitizeLogOutput(text: string): string {
  let out = text.slice(0, 500);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}
