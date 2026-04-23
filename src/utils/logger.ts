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
