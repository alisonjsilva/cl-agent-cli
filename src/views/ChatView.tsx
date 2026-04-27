import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { ChatMessage } from "../components/ChatMessage.js";
import { RichText } from "../components/RichText.js";
import { ThinkingIndicator } from "../components/ThinkingIndicator.js";
import { IntroBanner } from "../components/IntroBanner.js";
import { ChatEntry } from "../hooks/useAgent.js";
import type { SessionStats } from "../ai/agent.js";
import type { EnvironmentType } from "../config/schema.js";

interface ChatViewProps {
  entries: ChatEntry[];
  busy: boolean;
  streamingText: string;
  provider: string;
  model: string;
  account: string | null;
  env: EnvironmentType;
  toolsCount: number;
  sessionStats?: SessionStats;
}

export const ChatView: React.FC<ChatViewProps> = React.memo(({
  entries,
  busy,
  streamingText,
  provider,
  model,
  account,
  env,
  toolsCount,
  sessionStats,
}) => {
  const hasContent = entries.length > 0 || busy;

  const messageList = useMemo(
    () => entries.map((entry) => <ChatMessage key={entry.id} entry={entry} />),
    [entries],
  );

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {!hasContent && (
        <IntroBanner
          version="0.1.0"
          provider={provider}
          model={model}
          account={account}
          env={env}
          toolsCount={toolsCount}
        />
      )}

      {messageList}

      {busy && streamingText && (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingLeft={2}
          width="100%"
        >
          <RichText text={streamingText} />
          <Text dimColor>▊</Text>
        </Box>
      )}

      {busy && !streamingText && <ThinkingIndicator />}

      {sessionStats && hasContent && <SessionStatsBar stats={sessionStats} />}
    </Box>
  );
});

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const SessionStatsBar: React.FC<{ stats: SessionStats }> = ({ stats }) => {
  if (stats.totalRequests === 0) return null;

  const sessionDuration = formatDuration(Date.now() - stats.sessionStartedAt);

  return (
    <Box paddingX={1} marginTop={1} gap={2}>
      <Text dimColor>
        tokens: {formatTokens(stats.inputTokens)} in / {formatTokens(stats.outputTokens)} out
      </Text>
      <Text dimColor>
        requests: {stats.totalRequests}
      </Text>
      {stats.cacheHitTokens > 0 && (
        <Text dimColor>
          cache: {formatTokens(stats.cacheHitTokens)}
        </Text>
      )}
      {stats.lastRunMs > 0 && (
        <Text dimColor>took: {formatDuration(stats.lastRunMs)}</Text>
      )}
      <Text dimColor>session: {sessionDuration}</Text>
    </Box>
  );
};
