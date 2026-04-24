#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { appendFileSync, createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { App } from "./app.js";

// ── Redirect stderr to log file so library errors never corrupt the TUI ──
const logDir = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "cl-agent",
);
try { mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
const logPath = join(logDir, "debug.log");
const logStream = createWriteStream(logPath, { flags: "a" });
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
  return logStream.write(chunk, ...(args as []));
}) as typeof process.stderr.write;

function logToFile(label: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  const sanitized = raw
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_KEY]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*/g, "[REDACTED_JWT]")
    .replace(/client_secret["\s:=]+\S+/gi, "client_secret=[REDACTED]");
  try {
    appendFileSync(logPath, `[${new Date().toISOString()}] ${label} ${sanitized.slice(0, 500)}\n`);
  } catch { /* best-effort */ }
}

process.on("unhandledRejection", (err) => logToFile("UNHANDLED_REJECTION", err));
process.on("uncaughtException", (err) => {
  logToFile("UNCAUGHT_EXCEPTION", err);
  origStderrWrite(`Fatal error — see ${logPath}\n`);
  process.exit(1);
});

render(<App />);
