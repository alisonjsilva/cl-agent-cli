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
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  // Best-effort: tighten directory perms (POSIX only — chmod is a no-op on Windows).
  try { await fs.chmod(dir, 0o700); } catch { /* ignore */ }
  await fs.writeFile(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  // fs.writeFile only applies `mode` on file creation; force perms on every save
  // so config tightens itself even if the file pre-existed with looser perms.
  try { await fs.chmod(file, 0o600); } catch { /* ignore */ }
}
