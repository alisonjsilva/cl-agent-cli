import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";
import { ChatMessage } from "../components/ChatMessage.js";
import { RichText } from "../components/RichText.js";
import { ChatEntry } from "../hooks/useAgent.js";

interface ChatViewProps {
  entries: ChatEntry[];
  busy: boolean;
  streamingText: string;
}

export const ChatView: React.FC<ChatViewProps> = ({ entries, busy, streamingText }) => {
  const hasContent = entries.length > 0 || busy;

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {!hasContent && <EmptyState />}

      {entries.map((entry, i) => (
        <ChatMessage key={i} entry={entry} />
      ))}

      {busy && streamingText && (
        <Box
          borderStyle="round"
          borderColor="green"
          flexDirection="column"
          marginTop={1}
          paddingX={1}
          width="100%"
        >
          <Text color="green" bold>assistant</Text>
          <RichText text={streamingText} />
          <Text dimColor>▊</Text>
        </Box>
      )}

      {busy && !streamingText && (
        <Box marginTop={1} paddingLeft={2}>
          <Spinner label="thinking…" />
        </Box>
      )}
    </Box>
  );
};

const EmptyState: React.FC = () => (
  <Box
    borderStyle="round"
    borderColor="gray"
    flexDirection="column"
    paddingX={1}
    width="100%"
  >
    <Text color="green" bold>Ask about your Commerce Layer data</Text>
    <Text dimColor>
      Natural language for orders, customers, shipments, prices, returns, and more.
    </Text>
    <Box flexDirection="column" marginTop={1}>
      <Text color="cyan">- list 3 latest orders</Text>
      <Text color="cyan">- show order status for #107479454</Text>
      <Text color="cyan">- find customer john@example.com</Text>
      <Text color="cyan">- /accounts to manage CL accounts</Text>
      <Text color="cyan">- /provider to switch LLM provider</Text>
    </Box>
  </Box>
);
