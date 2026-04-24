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
const LLM_REQUEST_TIMEOUT_MS = 90_000;

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

type LLMErrorKind = "rate_limit" | "context_overflow" | "auth" | "network" | "timeout" | "fatal";

interface ErrorDigest {
  kind: LLMErrorKind;
  statusCode?: number;
  providerMessage?: string;
}

function unwrapError(err: unknown): { statusCode?: number; message: string; responseBody?: string } {
  const asAny = err as Record<string, unknown> | undefined;
  const inner = asAny?.lastError ?? err;
  const innerAny = inner as Record<string, unknown> | undefined;
  return {
    statusCode: (innerAny?.statusCode as number | undefined) ?? (asAny?.statusCode as number | undefined),
    message: inner instanceof Error ? inner.message : String(inner),
    responseBody: (innerAny?.responseBody as string | undefined) ?? (asAny?.responseBody as string | undefined),
  };
}

function extractProviderMessage(responseBody?: string): string | undefined {
  if (!responseBody) return undefined;
  try {
    const parsed = JSON.parse(responseBody);
    const meta = parsed?.error?.metadata;
    if (meta?.raw) return String(meta.raw);
    if (parsed?.error?.message) return String(parsed.error.message);
  } catch { /* not JSON */ }
  return undefined;
}

function digestError(err: unknown): ErrorDigest {
  if (err instanceof Error && err.name === "AbortError") {
    return { kind: "timeout" };
  }

  const { statusCode, message, responseBody } = unwrapError(err);
  const providerMessage = extractProviderMessage(responseBody);
  const lower = (message + " " + (providerMessage ?? "")).toLowerCase();

  if (statusCode === 429 || lower.includes("rate limit") || lower.includes("rate-limited") ||
      lower.includes("too many requests")) {
    return { kind: "rate_limit", statusCode, providerMessage };
  }

  if (lower.includes("timed out") || lower.includes("abort")) {
    return { kind: "timeout", statusCode, providerMessage };
  }

  if (lower.includes("context") || lower.includes("content_too_large") ||
      lower.includes("too long") || lower.includes("max_tokens") ||
      (lower.includes("token") && lower.includes("maximum"))) {
    return { kind: "context_overflow", statusCode, providerMessage };
  }

  if (statusCode === 401 || statusCode === 403 ||
      lower.includes("unauthorized") || lower.includes("invalid api key") || lower.includes("authentication")) {
    return { kind: "auth", statusCode, providerMessage };
  }

  if ((statusCode != null && statusCode >= 500) ||
      lower.includes("econnrefused") || lower.includes("enotfound") ||
      lower.includes("upstream connect error") || lower.includes("connection termination") ||
      lower.includes("no output generated")) {
    return { kind: "network", statusCode, providerMessage };
  }

  return { kind: "fatal", statusCode, providerMessage };
}

function isRetryable(kind: LLMErrorKind): boolean {
  return kind === "rate_limit" || kind === "network";
}

function retryDelay(attempt: number): number {
  const base = LLM_BASE_RETRY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * base * 0.3;
  return base + jitter;
}

function friendlyErrorMessage(digest: ErrorDigest): string {
  const hint = digest.providerMessage?.slice(0, 150);

  switch (digest.kind) {
    case "rate_limit":
      return hint
        ? `Rate limited: ${hint}`
        : "Rate limited by the LLM provider. Retrying automatically...";
    case "context_overflow":
      return "Conversation too long for the model's context window. History was trimmed — please retry.";
    case "auth":
      return "Authentication failed. Check your API key with /key or /provider.";
    case "timeout":
      return "Request timed out. The model may not support tool calling, or the provider is unresponsive. Try a different model with /model.";
    case "network": {
      const code = digest.statusCode ? ` (${digest.statusCode})` : "";
      return hint
        ? `Provider error${code}: ${hint}`
        : `Network error reaching the LLM provider${code}. Try again or switch models with /model.`;
    }
    default:
      return hint ?? "An unexpected error occurred. Try again or switch models with /model.";
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
      const abortController = new AbortController();
      const stepTimeout = setTimeout(
        () => abortController.abort(new Error("LLM request timed out")),
        LLM_REQUEST_TIMEOUT_MS,
      );

      // Declared outside try so catch can suppress dangling promise rejections
      let result: ReturnType<typeof streamText> | undefined;

      try {
        if (attempt > 0) {
          this.stats.totalRetries++;
          debugLog("info", `LLM retry attempt ${attempt}/${LLM_MAX_RETRIES}`);
        }

        result = streamText({
          model: this.opts.model,
          system: buildSystemPrompt(),
          messages: this.messages,
          tools: this.opts.tools,
          abortSignal: abortController.signal,
          maxRetries: 0,
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

        clearTimeout(stepTimeout);
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
        clearTimeout(stepTimeout);
        if (result) {
          const noop = () => {};
          Promise.resolve(result.usage).catch(noop);
          Promise.resolve(result.finishReason).catch(noop);
          Promise.resolve(result.response).catch(noop);
          Promise.resolve(result.providerMetadata).catch(noop);
        }
        lastError = err;
        const digest = digestError(err);
        const raw = err instanceof Error ? err.message : String(err);

        debugLog("error", `LLM error (${digest.kind}/${digest.statusCode ?? "?"}): ${raw.slice(0, 200)}`);

        if (digest.kind === "context_overflow") {
          this.aggressiveTrim();
          if (attempt < LLM_MAX_RETRIES) {
            this.opts.emit({
              type: "error",
              message: "Context window exceeded — trimming history and retrying...",
            });
            continue;
          }
        }

        if (isRetryable(digest.kind) && attempt < LLM_MAX_RETRIES) {
          const waitMs = retryDelay(attempt);
          this.opts.emit({
            type: "error",
            message: `${friendlyErrorMessage(digest)} (retry in ${Math.round(waitMs / 1000)}s)`,
          });
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        this.opts.emit({
          type: "error",
          message: friendlyErrorMessage(digest),
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
