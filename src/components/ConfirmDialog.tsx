import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { humanizeToolName } from "../utils/formatting.js";
import type { ConfirmContext } from "../tools/cl-tools.js";

interface ConfirmDialogProps {
  toolName: string;
  args: Record<string, unknown>;
  context?: ConfirmContext;
  onDecide: (ok: boolean) => void;
}

/** Filters terminal control characters so only visible confirmation text is captured. */
function isControlInput(input: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(input);
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  toolName,
  args,
  context,
  onDecide,
}) => {
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const isDelete = useMemo(
    () => /\b(delete|destroy|drop|remove)\b/i.test(toolName),
    [toolName],
  );
  const confirmationWord = isDelete ? "DELETE" : "YES";
  const canConfirm = typedConfirmation.trim().toUpperCase() === confirmationWord;

  useInput((input, key) => {
    if (key.escape) {
      onDecide(false);
      return;
    }
    if (key.backspace || key.delete) {
      setTypedConfirmation((current) => current.slice(0, -1));
      return;
    }
    if (key.return) {
      if (canConfirm) onDecide(true);
      return;
    }
    if (!input || isControlInput(input)) return;
    setTypedConfirmation((current) => current + input);
  });

  const maxLabel = context?.details.length
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
        <Text color="yellow" bold>Confirm </Text>
        <Text color="white" bold>{humanizeToolName(toolName)}</Text>
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

      {context?.command && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>Command:</Text>
          <Box paddingLeft={1}>
            <Text color="magenta">{context.command}</Text>
          </Box>
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
          {context?.warning ?? "This operation will modify data in Commerce Layer."}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Type <Text color="green" bold>{confirmationWord}</Text> and press <Text color="green" bold>Enter</Text> to continue.
        </Text>
        <Box>
          <Text dimColor>Confirmation: </Text>
          <Text color={canConfirm ? "green" : "white"}>{typedConfirmation || "…"}</Text>
          <Text dimColor>{canConfirm ? "  ✓ ready" : `  (type ${confirmationWord})`}</Text>
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="center">
        <Box>
          <Text color="red" bold>[Esc]</Text>
          <Text bold> Cancel</Text>
        </Box>
      </Box>
    </Box>
  );
};
