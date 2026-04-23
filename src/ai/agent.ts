import {
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { buildSystemPrompt } from "./system-prompt.js";
import { debugLog } from "../utils/logger.js";

const MAX_INPUT_LENGTH = 1500;
const DEFAULT_MAX_STEPS = 10;

const MAX_HISTORY_MESSAGES = 80;
const TRIM_TARGET = 40;

const LLM_MAX_RETRIES = 2;
const LLM_BASE_RETRY_MS = 1500;

export interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  totalRequests: number;
  totalRetries: number;
  totalToolCalls: number;
  sessionStartedAt: number;
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; output: string; isError: boolean }
  | { type: "error"; message: string }
  | { type: "stats"; stats: SessionStats }
  | { type: "done" };

export interface AgentOptions {
  model: LanguageModel;
  tools: ToolSet;
  emit: (event: AgentEvent) => void;
  maxSteps?: number;
}

type LLMErrorKind = "rate_limit" | "context_overflow" | "auth" | "network" | "fatal";

function classifyError(err: unknown): LLMErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return "rate_limit";
  }
  if (lower.includes("context") || lower.includes("token") || lower.includes("maximum") ||
      lower.includes("too long") || lower.includes("content_too_large") || lower.includes("max_tokens")) {
    return "context_overflow";
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") ||
      lower.includes("invalid api key") || lower.includes("authentication")) {
    return "auth";
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") ||
      lower.includes("timeout") || lower.includes("network") ||
      lower.includes("500") || lower.includes("502") || lower.includes("503") || lower.includes("504")) {
    return "network";
  }
  return "fatal";
}

function isRetryable(kind: LLMErrorKind): boolean {
  return kind === "rate_limit" || kind === "network";
}

function retryDelay(attempt: number): number {
  const base = LLM_BASE_RETRY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * base * 0.3;
  return base + jitter;
}

function friendlyErrorMessage(kind: LLMErrorKind, raw: string): string {
  switch (kind) {
    case "rate_limit":
      return "Rate limited by the LLM provider. Retrying automatically...";
    case "context_overflow":
      return "Conversation too long for the model's context window. History was trimmed — please retry.";
    case "auth":
      return "Authentication failed. Check your API key with /key or /provider.";
    case "network":
      return `Network error reaching the LLM provider. ${raw.slice(0, 120)}`;
    default:
      return raw.slice(0, 300);
  }
}

export class Agent {
  private messages: ModelMessage[] = [];
  private callSignatures = new Set<string>();
  private stats: SessionStats;
  opts: AgentOptions;

  constructor(opts: AgentOptions) {
    this.opts = opts;
    this.stats = {
      inputTokens: 0,
      outputTokens: 0,
      cacheHitTokens: 0,
      totalRequests: 0,
      totalRetries: 0,
      totalToolCalls: 0,
      sessionStartedAt: Date.now(),
    };
  }

  getMessages(): ModelMessage[] {
    return this.messages;
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }

  clearHistory(): void {
    this.messages = [];
    this.callSignatures.clear();
    this.stats = {
      inputTokens: 0,
      outputTokens: 0,
      cacheHitTokens: 0,
      totalRequests: 0,
      totalRetries: 0,
      totalToolCalls: 0,
      sessionStartedAt: Date.now(),
    };
  }

  updateModel(model: LanguageModel): void {
    this.opts.model = model;
  }

  updateTools(tools: ToolSet): void {
    this.opts.tools = tools;
  }

  private trimHistory(): void {
    if (this.messages.length <= MAX_HISTORY_MESSAGES) return;

    debugLog("info", `Trimming conversation history from ${this.messages.length} to ~${TRIM_TARGET} messages`);

    const keep = this.messages.slice(-TRIM_TARGET);

    if (keep.length > 0 && keep[0].role !== "user") {
      const firstUserIdx = keep.findIndex((m) => m.role === "user");
      if (firstUserIdx > 0) {
        keep.splice(0, firstUserIdx);
      }
    }

    this.messages = keep;
  }

  private aggressiveTrim(): void {
    debugLog("warn", "Aggressive history trim due to context overflow");
    const recentCount = Math.min(10, Math.floor(this.messages.length / 4));
    const keep = this.messages.slice(-recentCount);

    if (keep.length > 0 && keep[0].role !== "user") {
      const firstUserIdx = keep.findIndex((m) => m.role === "user");
      if (firstUserIdx > 0) {
        keep.splice(0, firstUserIdx);
      }
    }

    this.messages = keep;
  }

  async run(userInput: string): Promise<void> {
    if (userInput.length > MAX_INPUT_LENGTH) {
      this.opts.emit({
        type: "error",
        message: `Input too long (${userInput.length} chars, max ${MAX_INPUT_LENGTH}). Please shorten your message.`,
      });
      return;
    }

    this.trimHistory();
    this.messages.push({ role: "user", content: userInput });
    this.callSignatures.clear();

    const maxSteps = this.opts.maxSteps ?? DEFAULT_MAX_STEPS;

    for (let step = 0; step < maxSteps; step++) {
      const needsMore = await this.executeStep();
      if (!needsMore) return;
    }

    this.opts.emit({ type: "error", message: "Max agent steps reached." });
    this.opts.emit({ type: "stats", stats: this.getStats() });
  }

  private async executeStep(): Promise<boolean> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          this.stats.totalRetries++;
          debugLog("info", `LLM retry attempt ${attempt}/${LLM_MAX_RETRIES}`);
        }

        const result = streamText({
          model: this.opts.model,
          system: buildSystemPrompt(),
          messages: this.messages,
          tools: this.opts.tools,
        });

        let fullText = "";
        let userDeclinedInStep = false;

        for await (const chunk of result.fullStream) {
          if (chunk.type === "text-delta") {
            fullText += chunk.text;
            this.opts.emit({ type: "text_delta", text: chunk.text });
          }

          if (chunk.type === "tool-call") {
            const sig = chunk.toolName + ":" + JSON.stringify(chunk.input);
            if (this.callSignatures.has(sig)) continue;
            this.callSignatures.add(sig);
            this.stats.totalToolCalls++;
            this.opts.emit({
              type: "tool_call",
              toolName: chunk.toolName,
              args: chunk.input as Record<string, unknown>,
            });
          }

          if (chunk.type === "tool-result") {
            const toolResult = chunk as {
              type: "tool-result";
              toolName: string;
              output: unknown;
            };
            const output =
              typeof toolResult.output === "string"
                ? toolResult.output
                : JSON.stringify(toolResult.output);
            this.opts.emit({
              type: "tool_result",
              toolName: toolResult.toolName,
              output,
              isError: false,
            });
          }

          if (chunk.type === "tool-error") {
            const toolError = chunk as {
              type: "tool-error";
              toolName: string;
              error: unknown;
            };
            const errMsg =
              toolError.error instanceof Error
                ? toolError.error.message
                : String(toolError.error);
            const isDeclined = errMsg === "User declined this operation.";
            if (isDeclined) userDeclinedInStep = true;
            this.opts.emit({
              type: "tool_result",
              toolName: toolError.toolName,
              output: isDeclined ? "User declined." : errMsg,
              isError: true,
            });
          }
        }

        this.stats.totalRequests++;

        const usage = await result.usage;
        if (usage) {
          this.stats.inputTokens += usage.inputTokens ?? 0;
          this.stats.outputTokens += usage.outputTokens ?? 0;
        }

        const providerMeta = await result.providerMetadata;
        if (providerMeta) {
          const anthropicMeta = providerMeta.anthropic as
            | Record<string, unknown>
            | undefined;
          const cacheRead = anthropicMeta?.cacheReadInputTokens;
          if (typeof cacheRead === "number") {
            this.stats.cacheHitTokens += cacheRead;
          }
        }

        const responseMessages = (await result.response).messages;
        this.messages.push(...responseMessages);

        if (userDeclinedInStep) {
          this.opts.emit({ type: "done" });
          this.opts.emit({ type: "stats", stats: this.getStats() });
          return false;
        }

        const finishReason = await result.finishReason;

        if (finishReason === "tool-calls") {
          return true;
        }

        this.opts.emit({ type: "done" });
        this.opts.emit({ type: "stats", stats: this.getStats() });
        return false;
      } catch (err: unknown) {
        lastError = err;
        const kind = classifyError(err);
        const raw = err instanceof Error ? err.message : String(err);

        debugLog("error", `LLM error (${kind}): ${raw.slice(0, 200)}`);

        if (kind === "context_overflow") {
          this.aggressiveTrim();
          if (attempt < LLM_MAX_RETRIES) {
            this.opts.emit({
              type: "error",
              message: "Context window exceeded — trimming history and retrying...",
            });
            continue;
          }
        }

        if (isRetryable(kind) && attempt < LLM_MAX_RETRIES) {
          const waitMs = retryDelay(attempt);
          this.opts.emit({
            type: "error",
            message: `${friendlyErrorMessage(kind, raw)} (retry in ${Math.round(waitMs / 1000)}s)`,
          });
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        this.opts.emit({
          type: "error",
          message: friendlyErrorMessage(kind, raw),
        });
        this.opts.emit({ type: "stats", stats: this.getStats() });
        return false;
      }
    }

    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    this.opts.emit({ type: "error", message: msg.slice(0, 300) });
    this.opts.emit({ type: "stats", stats: this.getStats() });
    return false;
  }
}
