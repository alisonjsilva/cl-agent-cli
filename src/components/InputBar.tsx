import React, { useState, useEffect, useMemo, useRef } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { COMMANDS } from "../commands.js";
import type { EnvironmentType } from "../config/schema.js";

const ENV_BORDER_COLORS: Record<EnvironmentType, string> = {
  production: "red",
  staging: "yellow",
  test: "green",
  unknown: "cyan",
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface InputBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onCancel?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  account?: string | null;
  env?: EnvironmentType;
}

export const InputBar: React.FC<InputBarProps> = React.memo(({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  disabled,
  placeholder,
  account,
  env = "unknown",
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [spinTick, setSpinTick] = useState(0);
  const [escHint, setEscHint] = useState(false);
  const [autocompleteKey, setAutocompleteKey] = useState(0);
  const lastEscRef = useRef(0);
  const escHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spinner for busy state
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setSpinTick((s) => s + 1), 120);
    return () => clearInterval(t);
  }, [busy]);

  const suggestions = useMemo(() => {
    if (!value.startsWith("/") || disabled || busy) return [];
    const afterSlash = value.slice(1);
    if (afterSlash.includes(" ")) return [];
    const query = afterSlash.toLowerCase();
    if (!query) return COMMANDS;
    return COMMANDS.filter((cmd) => cmd.name.startsWith(query));
  }, [value, disabled, busy]);

  const isExactMatch =
    suggestions.length === 1 && value === "/" + suggestions[0]!.name;
  const showAutocomplete = suggestions.length > 0 && !isExactMatch;

  useEffect(() => {
    setSelectedIndex(0);
  }, [value]);

  const safeIndex = Math.min(
    selectedIndex,
    Math.max(suggestions.length - 1, 0),
  );

  const completeSelected = (): boolean => {
    const cmd = suggestions[safeIndex];
    if (!cmd) return false;
    if (cmd.args) {
      onChange("/" + cmd.name + " ");
      setAutocompleteKey((k) => k + 1);
    } else {
      onChange("");
      onSubmit("/" + cmd.name);
    }
    return true;
  };

  const handleSubmit = (text: string) => {
    if (showAutocomplete) {
      completeSelected();
      return;
    }
    onSubmit(text);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") process.exit(0);

    // Detect ESC: key.escape OR raw \x1b character
    const isEsc = key.escape || input === "\x1b";
    if (isEsc && busy && onCancel) {
      const now = Date.now();
      if (now - lastEscRef.current < 1500) {
        // Second ESC within window — cancel
        onCancel();
        lastEscRef.current = 0;
        setEscHint(false);
        if (escHintTimer.current) clearTimeout(escHintTimer.current);
      } else {
        // First ESC — show hint, start window
        lastEscRef.current = now;
        setEscHint(true);
        if (escHintTimer.current) clearTimeout(escHintTimer.current);
        escHintTimer.current = setTimeout(() => setEscHint(false), 1500);
      }
    }
  });

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev <= 0 ? suggestions.length - 1 : prev - 1,
        );
      }
      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev >= suggestions.length - 1 ? 0 : prev + 1,
        );
      }
      if (key.tab) {
        completeSelected();
      }
      if (key.escape) {
        onChange("");
      }
    },
    { isActive: showAutocomplete },
  );

  return (
    <Box flexDirection="column" width="100%">
      {showAutocomplete && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          {suggestions.map((cmd, i) => (
            <Box key={cmd.name} gap={1}>
              <Text
                color={i === safeIndex ? "cyan" : undefined}
                bold={i === safeIndex}
              >
                {i === safeIndex ? "›" : " "}
              </Text>
              <Text
                color={i === safeIndex ? "cyan" : "white"}
                bold={i === safeIndex}
              >
                /{cmd.name}
                {cmd.args ? ` ${cmd.args}` : ""}
              </Text>
              <Text dimColor>{cmd.description}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box
        borderStyle="round"
        borderColor={disabled || busy ? "gray" : ENV_BORDER_COLORS[env]}
        paddingX={1}
        width="100%"
      >
        {busy && (
          <>
            <Text color="yellow">{SPINNER_FRAMES[spinTick % SPINNER_FRAMES.length]} </Text>
          </>
        )}
        {!busy && account && (
          <Text color={ENV_BORDER_COLORS[env]} bold>
            {account}{" "}
          </Text>
        )}
        <Text color={disabled || busy ? "gray" : ENV_BORDER_COLORS[env]}>{"› "}</Text>
        <Box flexGrow={1}>
          {busy ? (
            <Text color={escHint ? "yellow" : "gray"}>
              {escHint ? "Press Esc again to cancel" : "Working… press Esc twice to cancel"}
            </Text>
          ) : disabled ? (
            <Text color="gray">{placeholder ?? "…"}</Text>
          ) : (
            <TextInput
              key={autocompleteKey}
              value={value}
              onChange={onChange}
              onSubmit={handleSubmit}
              placeholder={placeholder ?? "Ask about orders, customers, SKUs…"}
            />
          )}
        </Box>
      </Box>
      {showAutocomplete && (
        <Box paddingLeft={2}>
          <Text dimColor>↑↓ navigate  Tab/Enter select  Esc dismiss</Text>
        </Box>
      )}
    </Box>
  );
});
