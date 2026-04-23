import React from "react";
import { Box, Text, useInput } from "ink";
import { humanizeToolName } from "../utils/formatting.js";
import type { ConfirmContext } from "../tools/cl-tools.js";

interface ConfirmDialogProps {
  toolName: string;
  args: Record<string, unknown>;
  context?: ConfirmContext;
  onDecide: (ok: boolean) => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  toolName,
  args,
  context,
  onDecide,
}) => {
  useInput((input, key) => {
    if (key.return || input === "y" || input === "Y") onDecide(true);
    else if (key.escape || input === "n" || input === "N") onDecide(false);
  });

  const maxLabel = context
    ? Math.max(...context.details.map((d) => d.label.length))
    : 0;

  const argLines = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null)
    .filter(([k]) => !context || !["order_id", "authorization_id", "capture_id", "id"].includes(k))
    .map(([k, v]) => {
      const label = k.replace(/_/g, " ");
      const display = typeof v === "object" ? JSON.stringify(v) : String(v);
      return { label, display };
    });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      marginY={1}
      width="100%"
    >
      <Box>
        <Text color="yellow" bold>Are you sure you want to </Text>
        <Text color="white" bold>{humanizeToolName(toolName)}</Text>
        <Text color="yellow" bold>?</Text>
      </Box>

      {context && (
        <Box marginTop={1} flexDirection="column">
          <Text color="white" bold>{context.summary}</Text>
          <Text dimColor>{"─".repeat(36)}</Text>
          {context.details.map((d, i) => (
            <Box key={i} paddingLeft={1}>
              <Text>
                <Text dimColor>{d.label.padEnd(maxLabel + 1)}</Text>{" "}
                <Text color="cyan">{d.value}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {argLines.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>{context ? "Changes:" : "Parameters:"}</Text>
          {argLines.map((line, i) => (
            <Box key={i} paddingLeft={2}>
              <Text>
                <Text dimColor>-</Text>{" "}
                <Text bold>{line.label}:</Text>{" "}
                <Text color="cyan">{line.display}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="red" dimColor>
          This operation will modify data in Commerce Layer.
        </Text>
      </Box>

      <Box marginTop={1} justifyContent="center" gap={4}>
        <Box>
          <Text color="green" bold>[y/Enter]</Text>
          <Text bold> Yes</Text>
        </Box>
        <Box>
          <Text color="red" bold>[n/Esc]</Text>
          <Text bold> No</Text>
        </Box>
      </Box>
    </Box>
  );
};
