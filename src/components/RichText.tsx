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

const RichTable: React.FC<{ table: ParsedTable }> = ({ table }) => {
  const allRows = [table.headers, ...table.rows];
  const colCount = Math.max(...allRows.map((r) => r.length));

  // Compute max width per column
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = 0;
    for (const row of allRows) {
      const cell = row[c] ?? "";
      max = Math.max(max, cell.length);
    }
    colWidths.push(max);
  }

  const padCell = (text: string, col: number) =>
    text + " ".repeat(Math.max(0, (colWidths[col] ?? 0) - text.length));

  const renderRow = (cells: string[], key: string, isHeader: boolean) => (
    <Box key={key}>
      <Text dimColor>{"  "}</Text>
      {cells.map((cell, c) => (
        <React.Fragment key={c}>
          {c === 0 && <Text dimColor>│ </Text>}
          {isHeader ? (
            <Text bold>{padCell(cell, c)}</Text>
          ) : (
            <InlineRich text={padCell(cell, c)} />
          )}
          <Text dimColor> │{c < cells.length - 1 ? " " : ""}</Text>
        </React.Fragment>
      ))}
    </Box>
  );

  const separator = (key: string) => {
    const line = colWidths.map((w) => "─".repeat(w + 2)).join("┼");
    return (
      <Box key={key}>
        <Text dimColor>{"  ├"}{line}{"┤"}</Text>
      </Box>
    );
  };

  const topBorder = () => {
    const line = colWidths.map((w) => "─".repeat(w + 2)).join("┬");
    return (
      <Box key="top">
        <Text dimColor>{"  ┌"}{line}{"┐"}</Text>
      </Box>
    );
  };

  const bottomBorder = () => {
    const line = colWidths.map((w) => "─".repeat(w + 2)).join("┴");
    return (
      <Box key="bottom">
        <Text dimColor>{"  └"}{line}{"┘"}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {topBorder()}
      {renderRow(table.headers, "header", true)}
      {separator("sep")}
      {table.rows.map((row, i) => renderRow(row, `row-${i}`, false))}
      {bottomBorder()}
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
