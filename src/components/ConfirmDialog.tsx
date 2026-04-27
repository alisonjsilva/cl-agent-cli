import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  humanizeToolName,
  isDestructiveToolName,
  sanitizeTerminalText,
} from "../utils/formatting.js";
import type { ConfirmContext } from "../tools/cl-tools.js";

interface ConfirmDialogProps {
  toolName: string;
  args: Record<string, unknown>;
  context?: ConfirmContext;
  onDecide: (ok: boolean) => void;
}

const MAX_TYPED_CONFIRMATION = 32;

/** Filters terminal control characters so only visible confirmation text is captured. */
function containsControlCharacter(input: string): boolean {
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
    () => isDestructiveToolName(toolName),
    [toolName],
  );
  const confirmationWord = isDelete ? "DELETE" : "YES";
  const canConfirm = typedConfirmation.trim().toUpperCase() === confirmationWord;
  const details = context?.details ?? [];
  const safeToolName = useMemo(
    () => sanitizeTerminalText(humanizeToolName(toolName)),
    [toolName],
  );
  const safeSummary = useMemo(
    () => (context ? sanitizeTerminalText(context.summary) : ""),
    [context],
  );
  const safeDetails = useMemo(
    () => details.map((detail) => ({
      label: sanitizeTerminalText(detail.label),
      value: sanitizeTerminalText(detail.value),
    })),
    [details],
  );
  const safeCommand = useMemo(
    () => (context?.command ? sanitizeTerminalText(context.command) : undefined),
    [context?.command],
  );
  const safeWarning = useMemo(
    () => (context?.warning ? sanitizeTerminalText(context.warning) : undefined),
    [context?.warning],
  );

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
    if (!input || containsControlCharacter(input)) return;
    setTypedConfirmation((current) =>
      (current + input).slice(-MAX_TYPED_CONFIRMATION)
    );
  });

  const maxLabel = useMemo(
    () => (safeDetails.length ? Math.max(...safeDetails.map((d) => d.label.length)) : 0),
    [safeDetails],
  );

  const argLines = useMemo(
    () => Object.entries(args)
      .filter(([, v]) => v !== undefined && v !== null)
      .filter(([k]) => !context || !["order_id", "authorization_id", "capture_id", "id"].includes(k))
      .map(([k, v]) => {
        const label = sanitizeTerminalText(k.replace(/_/g, " "));
        const rawDisplay = typeof v === "object" ? JSON.stringify(v) : String(v);
        const display = sanitizeTerminalText(rawDisplay);
        return { label, display };
      }),
    [args, context],
  );

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
        <Text color="white" bold>{safeToolName}</Text>
      </Box>

      {context && (
        <Box marginTop={1} flexDirection="column">
          <Text color="white" bold>{safeSummary}</Text>
          <Text dimColor>{"─".repeat(36)}</Text>
          {safeDetails.map((d, i) => (
            <Box key={i} paddingLeft={1}>
              <Text>
                <Text dimColor>{d.label.padEnd(maxLabel + 1)}</Text>{" "}
                <Text color="cyan">{d.value}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {safeCommand && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow" bold>Command:</Text>
          <Box paddingLeft={1}>
            <Text color="magenta">{safeCommand}</Text>
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
          {safeWarning ?? "This operation will modify data in Commerce Layer."}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Type <Text color="green" bold>{confirmationWord}</Text> and press <Text color="green" bold>Enter</Text> to continue.
        </Text>
        <Box>
          <Text dimColor>Confirmation: </Text>
          <Text color={canConfirm ? "green" : "white"}>{typedConfirmation || "(empty)"}</Text>
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
