const MAX_ARG_SUMMARY = 96;
const MAX_LINES = 24;
const MAX_CHARS = 1500;

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function humanizeToolName(name: string): string {
  const plain = name.replace(/^cl_/, "").replace(/_/g, " ").trim();
  return plain.length > 0 ? plain : name;
}

export function summarizeArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${summarizeValue(v)}`);
  const summary = parts.join(" ");
  return summary.length <= MAX_ARG_SUMMARY
    ? summary
    : `${summary.slice(0, MAX_ARG_SUMMARY - 1)}…`;
}

export function compactToolResult(output: string): string {
  const first = output.split("\n").find((l) => l.trim());
  if (!first) return output.slice(0, 100);
  const trimmed = first.trim();
  return trimmed.length > 120 ? trimmed.slice(0, 119) + "…" : trimmed;
}

export function truncateText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const truncated = lines.length > MAX_LINES
    ? [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more lines`]
    : lines;
  const joined = truncated.join("\n");
  return joined.length > MAX_CHARS
    ? `${joined.slice(0, MAX_CHARS - 1)}…`
    : joined;
}

export function formatAssistantText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(stripMarkdown)
    .join("\n")
    .trim();
}

export function redactSecrets(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "…" + value.slice(-4);
}

const TEXT_TOOL_CALL_RE =
  /<\s*(?:FunctionCall|function_call|tool_call|tool_use)[\s\S]*?<\s*\/\s*(?:FunctionCall|function_call|tool_call|tool_use)\s*>/gi;

const PARTIAL_TAG_RE =
  /<\s*(?:FunctionCall|function_call|tool_call|tool_use)[\s\S]*$/i;

export function stripTextToolCalls(text: string): { cleaned: string; hadToolCalls: boolean } {
  const hadComplete = TEXT_TOOL_CALL_RE.test(text);
  let cleaned = text.replace(TEXT_TOOL_CALL_RE, "");

  const hadPartial = PARTIAL_TAG_RE.test(cleaned);
  if (hadPartial) {
    cleaned = cleaned.replace(PARTIAL_TAG_RE, "");
  }

  return { cleaned: cleaned.trim(), hadToolCalls: hadComplete || hadPartial };
}

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function summarizeValue(value: unknown): string {
  if (typeof value === "string") {
    const s = value.replace(/\s+/g, " ").trim();
    return s.length <= 24 ? s : `${s.slice(0, 23)}…`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).length}}`;
  return "null";
}
