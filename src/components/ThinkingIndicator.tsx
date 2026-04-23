import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

const THINKING_PHASES = [
  "Thinking",
  "Analyzing your request",
  "Reasoning",
  "Working on it",
  "Processing",
];

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const BAR_WIDTH = 20;

export const ThinkingIndicator: React.FC = () => {
  const [frame, setFrame] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [dots, setDots] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const spinnerTimer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);

    const dotsTimer = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 500);

    const phaseTimer = setInterval(() => {
      setPhaseIdx((p) => (p + 1) % THINKING_PHASES.length);
    }, 3000);

    const elapsedTimer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);

    return () => {
      clearInterval(spinnerTimer);
      clearInterval(dotsTimer);
      clearInterval(phaseTimer);
      clearInterval(elapsedTimer);
    };
  }, []);

  const phase = THINKING_PHASES[phaseIdx]!;
  const dotStr = ".".repeat(dots);
  const spinner = SPINNER_FRAMES[frame]!;
  const barPos = frame % BAR_WIDTH;
  const bar = "░".repeat(barPos) + "▓▓" + "░".repeat(Math.max(0, BAR_WIDTH - barPos - 2));

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      borderStyle="round"
      borderColor="yellow"
      width="100%"
    >
      <Box gap={1}>
        <Text color="yellow">{spinner}</Text>
        <Text color="yellow" bold>
          {phase}{dotStr}
        </Text>
        <Text dimColor>({formatTime(elapsed)})</Text>
      </Box>
      <Box>
        <Text color="yellow">{bar}</Text>
      </Box>
    </Box>
  );
};
