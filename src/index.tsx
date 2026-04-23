#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./app.js";

process.on("unhandledRejection", (err) => {
  const raw = err instanceof Error ? err.message : String(err);
  const sanitized = raw
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_KEY]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*/g, "[REDACTED_JWT]")
    .replace(/client_secret["\s:=]+\S+/gi, "client_secret=[REDACTED]");
  console.error("unhandledRejection:", sanitized);
});

render(<App />);
