import { useState, useRef, useCallback } from "react";
import type { ToolSet } from "ai";
import { Agent, type AgentEvent, type SessionStats } from "../ai/agent.js";
import { makeModel } from "../ai/providers.js";
import { Config } from "../config/schema.js";
import { stripTextToolCalls, compactToolResult } from "../utils/formatting.js";

export interface ChatEntry {
  id: number;
  kind: "user" | "assistant" | "tool_call" | "tool_result" | "info" | "error";
  text: string;
  toolName?: string;
  args?: Record<string, unknown>;
  isError?: boolean;
}

const MAX_ENTRIES = 120;
let entrySeq = 0;

export function useAgent(cfg: Config, tools: ToolSet) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sessionStats, setSessionStats] = useState<SessionStats | undefined>();
  const agentRef = useRef<Agent | null>(null);

  const append = useCallback((entry: Omit<ChatEntry, "id">) => {
    setEntries((prev) => {
      const next = [...prev, { ...entry, id: ++entrySeq }];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  const getAgent = useCallback((): Agent => {
    if (!agentRef.current) {
      agentRef.current = new Agent({
        model: makeModel(cfg),
        tools,
        emit: () => {},
      });
    }
    return agentRef.current;
  }, [cfg, tools]);

  const send = useCallback(async (input: string) => {
    if (!input.trim() || busy) return;

    append({ kind: "user", text: input });
    setBusy(true);
    setStreamingText("");

    const agent = getAgent();

    try {
      agent.updateModel(makeModel(cfg));
      agent.updateTools(tools);
    } catch (err: unknown) {
      append({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
      setBusy(false);
      return;
    }

    let currentText = "";
    let detectedTextToolCalls = false;

    const handler = (e: AgentEvent) => {
      switch (e.type) {
        case "text_delta":
          currentText += e.text;
          {
            const { cleaned, hadToolCalls } = stripTextToolCalls(currentText);
            if (hadToolCalls) detectedTextToolCalls = true;
            setStreamingText(cleaned);
          }
          break;
        case "tool_call":
          append({
            kind: "tool_call",
            text: e.toolName,
            toolName: e.toolName,
            args: e.args,
          });
          break;
        case "tool_result":
          append({
            kind: "tool_result",
            text: e.isError ? e.output.slice(0, 300) : compactToolResult(e.output),
            toolName: e.toolName,
            isError: e.isError,
          });
          break;
        case "error":
          append({ kind: "error", text: e.message });
          break;
        case "stats":
          setSessionStats(e.stats);
          break;
        case "done": {
          const { cleaned, hadToolCalls } = stripTextToolCalls(currentText);
          if (hadToolCalls) detectedTextToolCalls = true;
          if (cleaned) {
            append({ kind: "assistant", text: cleaned });
          }
          if (detectedTextToolCalls) {
            append({
              kind: "error",
              text: "This model does not support tool calling. Switch to a capable model (e.g. Claude, GPT-4o, Gemini Pro) via /provider.",
            });
          }
          currentText = "";
          setStreamingText("");
          break;
        }
      }
    };

    agent.opts.emit = handler;
    await agent.run(input);
    setBusy(false);

    if (currentText.trim()) {
      const { cleaned, hadToolCalls } = stripTextToolCalls(currentText);
      if (cleaned) {
        append({ kind: "assistant", text: cleaned });
      }
      if (hadToolCalls || detectedTextToolCalls) {
        append({
          kind: "error",
          text: "This model does not support tool calling. Switch to a capable model (e.g. Claude, GPT-4o, Gemini Pro) via /provider.",
        });
      }
      setStreamingText("");
    }
  }, [append, busy, cfg, getAgent, tools]);

  const clear = useCallback(() => {
    setEntries([]);
    setStreamingText("");
    setSessionStats(undefined);
    agentRef.current?.clearHistory();
  }, []);

  return { entries, busy, streamingText, sessionStats, send, clear, append };
}
