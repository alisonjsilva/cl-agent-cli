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

export const RichText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const trimmed = line.replace(/^#{1,6}\s*/, "")
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .replace(/`([^`]+)`/g, "$1");

        const bulletMatch = trimmed.match(/^[-•*]\s+/);
        if (bulletMatch) {
          const content = trimmed.slice(bulletMatch[0].length);
          return (
            <Box key={i} paddingLeft={1}>
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
            <Box key={i} paddingLeft={1}>
              <Text dimColor>{` ${numMatch[1]}. `}</Text>
              <Box flexShrink={1}>
                <InlineRich text={content} />
              </Box>
            </Box>
          );
        }

        if (!trimmed) return <Text key={i}>{" "}</Text>;

        return (
          <Box key={i}>
            <InlineRich text={trimmed} />
          </Box>
        );
      })}
    </Box>
  );
};
