import type { ToolSet } from "ai";
import { Config } from "../config/schema.js";
import { getActiveAccount } from "../config/accounts.js";
import { createCLTools, isMutatingTool, type MutationConfirmFn } from "./cl-tools.js";
import { loadMCPTools } from "./mcp-tools.js";
import { createDocsTools, setDocsAskEnabled } from "./cl-docs.js";

export interface ToolRegistryResult {
  tools: ToolSet;
  toolCount: number;
  isMutating: (name: string) => boolean;
}

export async function buildToolRegistry(
  cfg: Config,
  confirmFn?: MutationConfirmFn,
): Promise<ToolRegistryResult> {
  const account = getActiveAccount(cfg);
  let tools: ToolSet = {};

  // Docs search is always available, regardless of account configuration.
  // Sync the ?ask= flag from config so it's correct from the first tool call.
  setDocsAskEnabled(cfg.docsAskEnabled !== false);
  tools = { ...tools, ...createDocsTools() };

  if (account) {
    const clTools = createCLTools(account, confirmFn);
    tools = { ...tools, ...clTools };
  }

  if (Object.keys(cfg.mcpServers).length > 0) {
    const mcpTools = await loadMCPTools(cfg.mcpServers, confirmFn);
    tools = { ...tools, ...mcpTools };
  }

  return {
    tools,
    toolCount: Object.keys(tools).length,
    isMutating: isMutatingTool,
  };
}
