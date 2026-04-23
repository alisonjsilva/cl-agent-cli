import type { ToolSet } from "ai";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { MCPServerConfig } from "../config/schema.js";
import { debugLog } from "../utils/logger.js";
import type { MutationConfirmFn } from "./cl-tools.js";
import { UserDeclinedError } from "./cl-tools.js";

const activeClients: MCPClient[] = [];

const MUTATION_KEYWORDS =
  /\b(create|update|delete|remove|modify|mutate|write|patch|put|post|cancel|archive|destroy|drop|insert|alter|set|send|execute|run|invoke|trigger)\b/i;

export async function loadMCPTools(
  servers: Record<string, MCPServerConfig>,
  confirmFn?: MutationConfirmFn,
): Promise<ToolSet> {
  let merged: ToolSet = {};

  for (const [name, config] of Object.entries(servers)) {
    try {
      const client = await connectMCPServer(name, config);
      activeClients.push(client);
      const tools = await client.tools();
      const wrapped = wrapMCPTools(tools, confirmFn);
      merged = { ...merged, ...wrapped };
      debugLog("info", `MCP server "${name}": loaded ${Object.keys(tools).length} tools`);
    } catch (err: unknown) {
      debugLog("error", `MCP server "${name}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return merged;
}

function wrapMCPTools(
  tools: ToolSet,
  confirmFn?: MutationConfirmFn,
): ToolSet {
  if (!confirmFn) return tools;

  const wrapped: ToolSet = {};

  for (const [name, originalTool] of Object.entries(tools)) {
    const desc = String((originalTool as Record<string, unknown>).description ?? "");
    const looksDestructive = MUTATION_KEYWORDS.test(desc) || MUTATION_KEYWORDS.test(name);

    if (looksDestructive && originalTool.execute) {
      const origExecute = originalTool.execute;
      wrapped[name] = {
        ...originalTool,
        execute: async (...execArgs: Parameters<typeof origExecute>) => {
          const args = (execArgs[0] ?? {}) as Record<string, unknown>;
          const ok = await confirmFn(name, args);
          if (!ok) throw new UserDeclinedError();
          return origExecute(...execArgs);
        },
      };
    } else {
      wrapped[name] = originalTool;
    }
  }

  return wrapped;
}

async function connectMCPServer(
  name: string,
  config: MCPServerConfig,
): Promise<MCPClient> {
  if (config.url) {
    return createMCPClient({
      transport: {
        type: "sse",
        url: config.url,
        headers: config.env,
      },
      name: `cl-agent-${name}`,
    });
  }

  if (config.command) {
    const { Experimental_StdioMCPTransport } = await import("@ai-sdk/mcp/mcp-stdio");
    return createMCPClient({
      transport: new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
      }),
      name: `cl-agent-${name}`,
    });
  }

  throw new Error(`MCP server "${name}" needs either "url" or "command"`);
}

export async function closeMCPClients(): Promise<void> {
  for (const client of activeClients) {
    try {
      await client.close();
    } catch { /* ignore */ }
  }
  activeClients.length = 0;
}
