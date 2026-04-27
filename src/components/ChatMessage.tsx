import React from "react";
import { Box, Text } from "ink";
import { ChatEntry } from "../hooks/useAgent.js";
import { humanizeToolName, summarizeArgs } from "../utils/formatting.js";
import { RichText } from "./RichText.js";

export const ChatMessage: React.FC<{ entry: ChatEntry }> = React.memo(({ entry }) => {
  switch (entry.kind) {
    case "user":
      return (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingLeft={2}
          width="100%"
        >
          <Text color="cyan" bold>you</Text>
          <Text>{entry.text}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingLeft={2}
          width="100%"
        >
          <Text color="green" bold>assistant</Text>
          <RichText text={entry.text} />
        </Box>
      );

    case "tool_call": {
      const name = humanizeToolName(entry.toolName ?? "");
      const args = entry.args
        ? summarizeArgs(entry.args as Record<string, unknown>)
        : "";
      return (
        <Box marginTop={1} paddingLeft={2} width="100%">
          <Text>
            <Text color="blue">{"⏺ "}</Text>
            <Text color="blue" bold>{name}</Text>
            {args ? <Text dimColor>{" "}{args}</Text> : null}
          </Text>
        </Box>
      );
    }

    case "tool_result":
      return (
        <Box paddingLeft={4} width="100%">
          <Text color={entry.isError ? "red" : "gray"}>
            {entry.isError ? "✗ " : "↳ "}
            {entry.text}
          </Text>
        </Box>
      );

    case "info":
      return (
        <Box marginTop={1} paddingLeft={1} width="100%">
          <Text dimColor>{entry.text}</Text>
        </Box>
      );

    case "error":
      return (
        <Box marginTop={1} paddingLeft={1} width="100%">
          <Text color="red">✗ {entry.text}</Text>
        </Box>
      );
  }
});
