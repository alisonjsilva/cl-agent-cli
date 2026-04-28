import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const ThinkingIndicator: React.FC = () => {
  const [tick, setTick] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(timer);
  }, []);

  const spinner = SPINNER_FRAMES[tick % SPINNER_FRAMES.length]!;
  const dots = ".".repeat(tick % 4);
  const pad = " ".repeat(3 - (tick % 4));
  const elapsed = Math.floor((Date.now() - startTime.current) / 1000);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <Box marginTop={1} paddingLeft={2} gap={1}>
      <Text color="yellow">{spinner}</Text>
      <Text color="yellow">Thinking{dots}{pad}</Text>
      {elapsed > 0 && <Text dimColor>{formatTime(elapsed)}</Text>}
    </Box>
  );
};
