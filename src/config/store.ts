import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Config, DEFAULT_CONFIG } from "./schema.js";

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "cl-agent");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export async function loadConfig(): Promise<Config> {
  const file = configPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      providers: { ...DEFAULT_CONFIG.providers, ...(parsed.providers ?? {}) },
      accounts: { ...(parsed.accounts ?? {}) },
      mcpServers: { ...(parsed.mcpServers ?? {}) },
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(DEFAULT_CONFIG);
    }
    throw err;
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  const file = configPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
