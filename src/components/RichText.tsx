import React from "react";
import { Box, Text } from "ink";

type TokenType = "text" | "status" | "amount" | "email" | "order";

interface Token {
  type: TokenType;
  text: string;
  color?: string;
}

const INLINE_RE =
  /(?<order>#\d{5,})|(?<amount>[€$]\s?[\d.,]+|[\d.,]+\s?[€$])|(?<email>[\w.+-]+@[\w.-]+\.\w{2,})|(?<status>\b(?:pending|approved|placed|cancelled|canceled|paid|unpaid|authorized|refunded|unfulfilled|fulfilled|in_progress|partially_paid|partially_refunded|partially_authorized|draft|archived|voided|captured|free)\b)/gi;

const STATUS_COLORS: Record<string, string> = {
  approved: "green",
  placed: "green",
  paid: "green",
  fulfilled: "green",
  captured: "green",
  free: "green",
  cancelled: "red",
  canceled: "red",
  refunded: "red",
  voided: "red",
  pending: "yellow",
  unpaid: "yellow",
  authorized: "yellow",
  draft: "yellow",
  unfulfilled: "yellow",
  in_progress: "blue",
  partially_paid: "blue",
  partially_refunded: "blue",
  partially_authorized: "blue",
  archived: "gray",
};

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(INLINE_RE)) {
    const idx = match.index!;
    if (idx > lastIndex) {
      tokens.push({ type: "text", text: line.slice(lastIndex, idx) });
    }

    const m = match[0];
    if (match.groups?.order) {
      tokens.push({ type: "order", text: m });
    } else if (match.groups?.amount) {
      tokens.push({ type: "amount", text: m });
    } else if (match.groups?.email) {
      tokens.push({ type: "email", text: m });
    } else if (match.groups?.status) {
      tokens.push({
        type: "status",
        text: m,
        color: STATUS_COLORS[m.toLowerCase()] ?? "white",
      });
    }
    lastIndex = idx + m.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: "text", text: line.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: "text", text: line }];
}

const InlineRich: React.FC<{ text: string }> = ({ text }) => {
  const tokens = tokenize(text);
  return (
    <Text>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "order":
            return <Text key={i} color="cyan" bold>{t.text}</Text>;
          case "amount":
            return <Text key={i} color="white" bold>{t.text}</Text>;
          case "email":
            return <Text key={i} dimColor>{t.text}</Text>;
          case "status":
            return <Text key={i} color={t.color} bold>{t.text}</Text>;
          default:
            return <Text key={i}>{t.text}</Text>;
        }
      })}
    </Text>
  );
};

// --- Table parsing ---

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

const TABLE_ROW_RE = /^\|(.+)\|$/;
const SEPARATOR_RE = /^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|$/;

function isTableRow(line: string): boolean {
  return TABLE_ROW_RE.test(line.trim());
}

function isSeparatorRow(line: string): boolean {
  return SEPARATOR_RE.test(line.trim());
}

function parseTableCells(line: string): string[] {
  const m = line.trim().match(TABLE_ROW_RE);
  if (!m) return [];
  return m[1]!.split("|").map((c) => c.trim());
}

function extractTableBlocks(
  lines: string[],
): Array<{ type: "lines"; lines: string[] } | { type: "table"; table: ParsedTable }> {
  const blocks: Array<
    { type: "lines"; lines: string[] } | { type: "table"; table: ParsedTable }
  > = [];
  let i = 0;

  while (i < lines.length) {
    // Try to detect a table: header row, then separator, then data rows
    if (
      i + 1 < lines.length &&
      isTableRow(lines[i]!) &&
      isSeparatorRow(lines[i + 1]!)
    ) {
      const headers = parseTableCells(lines[i]!);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]!)) {
        if (isSeparatorRow(lines[i]!)) {
          i++;
          continue;
        }
        rows.push(parseTableCells(lines[i]!));
        i++;
      }
      blocks.push({ type: "table", table: { headers, rows } });
    } else {
      // Accumulate non-table lines
      const last = blocks[blocks.length - 1];
      if (last && last.type === "lines") {
        last.lines.push(lines[i]!);
      } else {
        blocks.push({ type: "lines", lines: [lines[i]!] });
      }
      i++;
    }
  }

  return blocks;
}

function wrapCell(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const out: string[] = [];
  // Split on existing newlines first, then wrap each segment
  for (const segment of text.split(/\n/)) {
    if (segment.length === 0) {
      out.push("");
      continue;
    }
    const words = segment.split(/\s+/);
    let line = "";
    for (const word of words) {
      // If a single word is longer than width, hard-break it
      if (word.length > width) {
        if (line) {
          out.push(line);
          line = "";
        }
        let rest = word;
        while (rest.length > width) {
          out.push(rest.slice(0, width));
          rest = rest.slice(width);
        }
        line = rest;
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > width) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out.length > 0 ? out : [""];
}

function computeColumnWidths(
  rows: string[][],
  colCount: number,
  available: number,
): number[] {
  // Natural width = max content length per column
  const natural: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = 1;
    for (const row of rows) {
      max = Math.max(max, (row[c] ?? "").length);
    }
    natural.push(max);
  }

  // Overhead: "│ " before first col, " │ " between cols, " │" after last
  const overhead = 2 + (colCount - 1) * 3 + 2;
  const budget = Math.max(colCount * 6, available - overhead);
  const totalNatural = natural.reduce((a, b) => a + b, 0);

  // If it fits, use natural widths
  if (totalNatural <= budget) return natural;

  // Minimum width per column = max longest word (so words don't hard-break), floor 6
  const minWidths = natural.map((_, c) => {
    let longest = 6;
    for (const row of rows) {
      for (const word of (row[c] ?? "").split(/\s+/)) {
        longest = Math.max(longest, word.length);
      }
    }
    return Math.min(longest, natural[c]!);
  });

  // Start with natural widths and shrink the widest columns first
  const widths = [...natural];
  let total = totalNatural;

  while (total > budget) {
    // Find the widest column that's still above its minimum
    let maxIdx = -1;
    let maxW = 0;
    for (let c = 0; c < colCount; c++) {
      if (widths[c]! > minWidths[c]! && widths[c]! > maxW) {
        maxW = widths[c]!;
        maxIdx = c;
      }
    }
    if (maxIdx === -1) break; // all at minimum
    widths[maxIdx]!--;
    total--;
  }

  return widths;
}

const RichTable: React.FC<{ table: ParsedTable }> = ({ table }) => {
  const allRows = [table.headers, ...table.rows];
  const colCount = Math.max(...allRows.map((r) => r.length));

  // Available terminal width (fall back to 80)
  const termWidth =
    typeof process !== "undefined" && process.stdout && process.stdout.columns
      ? process.stdout.columns
      : 80;
  // Subtract leading "  " indent and a small safety margin
  const available = Math.max(20, termWidth - 6);

  const colWidths = computeColumnWidths(allRows, colCount, available);

  const buildRowLines = (cells: string[]): string[] => {
    const wrapped: string[][] = [];
    for (let c = 0; c < colCount; c++) {
      wrapped.push(wrapCell(cells[c] ?? "", colWidths[c]!));
    }
    const height = Math.max(...wrapped.map((w) => w.length));
    const lines: string[] = [];
    for (let h = 0; h < height; h++) {
      const parts: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const raw = wrapped[c]![h] ?? "";
        const padded = raw + " ".repeat(Math.max(0, colWidths[c]! - raw.length));
        parts.push(padded);
      }
      lines.push("│ " + parts.join(" │ ") + " │");
    }
    return lines;
  };

  const buildBorder = (left: string, mid: string, right: string): string => {
    const segs = colWidths.map((w) => "─".repeat(w + 2)).join(mid);
    return left + segs + right;
  };

  const headerLines = buildRowLines(table.headers);
  const bodyRowsLines = table.rows.map(buildRowLines);
  const rowSep = buildBorder("├", "┼", "┤");

  const bodyElements: React.ReactNode[] = [];
  bodyRowsLines.forEach((lines, ri) => {
    if (ri > 0) {
      bodyElements.push(<Text key={`sep-${ri}`} dimColor>{"  "}{rowSep}</Text>);
    }
    lines.forEach((line, li) => {
      bodyElements.push(<Text key={`r${ri}-${li}`}>{"  "}{line}</Text>);
    });
  });

  return (
    <Box flexDirection="column">
      <Text dimColor>{"  "}{buildBorder("┌", "┬", "┐")}</Text>
      {headerLines.map((line, i) => (
        <Text key={`h-${i}`} bold>{"  "}{line}</Text>
      ))}
      <Text dimColor>{"  "}{buildBorder("╞", "╪", "╡")}</Text>
      {bodyElements}
      <Text dimColor>{"  "}{buildBorder("└", "┴", "┘")}</Text>
    </Box>
  );
};

// --- Main component ---

export const RichText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = extractTableBlocks(lines);

  return (
    <Box flexDirection="column">
      {blocks.map((block, bi) => {
        if (block.type === "table") {
          return <RichTable key={`table-${bi}`} table={block.table} />;
        }
        return block.lines.map((line, li) => {
          const key = `${bi}-${li}`;
          const trimmed = line
            .replace(/^#{1,6}\s*/, "")
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1");

          const bulletMatch = trimmed.match(/^[-•*]\s+/);
          if (bulletMatch) {
            const content = trimmed.slice(bulletMatch[0].length);
            return (
              <Box key={key} paddingLeft={1}>
                <Text color="cyan">{"  · "}</Text>
                <Box flexShrink={1}>
                  <InlineRich text={content} />
                </Box>
              </Box>
            );
          }

          const numMatch = trimmed.match(/^(\d+)[.)]\s+/);
          if (numMatch) {
            const content = trimmed.slice(numMatch[0].length);
            return (
              <Box key={key} paddingLeft={1}>
                <Text dimColor>{` ${numMatch[1]}. `}</Text>
                <Box flexShrink={1}>
                  <InlineRich text={content} />
                </Box>
              </Box>
            );
          }

          if (!trimmed) return <Text key={key}>{" "}</Text>;

          return (
            <Box key={key}>
              <InlineRich text={trimmed} />
            </Box>
          );
        });
      })}
    </Box>
  );
};
