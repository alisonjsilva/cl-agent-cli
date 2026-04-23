import { streamText, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { buildSystemPrompt } from "./system-prompt.js";

const MAX_INPUT_LENGTH = 2000;

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; output: string; isError: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AgentOptions {
  model: LanguageModel;
  tools: ToolSet;
  emit: (event: AgentEvent) => void;
  maxSteps?: number;
}

export class Agent {
  private messages: ModelMessage[] = [];
  private callSignatures = new Set<string>();
  opts: AgentOptions;

  constructor(opts: AgentOptions) {
    this.opts = opts;
  }

  getMessages(): ModelMessage[] {
    return this.messages;
  }

  clearHistory(): void {
    this.messages = [];
    this.callSignatures.clear();
  }

  updateModel(model: LanguageModel): void {
    this.opts.model = model;
  }

  updateTools(tools: ToolSet): void {
    this.opts.tools = tools;
  }

  async run(userInput: string): Promise<void> {
    if (userInput.length > MAX_INPUT_LENGTH) {
      this.opts.emit({
        type: "error",
        message: `Input too long (${userInput.length} chars, max ${MAX_INPUT_LENGTH}). Please shorten your message.`,
      });
      return;
    }

    this.messages.push({ role: "user", content: userInput });
    this.callSignatures.clear();

    const maxSteps = this.opts.maxSteps ?? 10;

    for (let step = 0; step < maxSteps; step++) {
      try {
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
            if (this.callSignatures.has(sig)) {
              continue;
            }
            this.callSignatures.add(sig);

            this.opts.emit({
              type: "tool_call",
              toolName: chunk.toolName,
              args: chunk.input as Record<string, unknown>,
            });
          }

          if (chunk.type === "tool-result") {
            const toolResult = chunk as { type: "tool-result"; toolName: string; output: unknown };
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
            const toolError = chunk as { type: "tool-error"; toolName: string; error: unknown };
            const errMsg = toolError.error instanceof Error
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

        const responseMessages = (await result.response).messages;
        this.messages.push(...responseMessages);

        if (userDeclinedInStep) {
          this.opts.emit({ type: "done" });
          return;
        }

        const finishReason = await result.finishReason;

        if (finishReason !== "tool-calls") {
          this.opts.emit({ type: "done" });
          return;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.opts.emit({ type: "error", message: msg });
        return;
      }
    }

    this.opts.emit({ type: "error", message: "Max agent steps reached." });
  }
}
