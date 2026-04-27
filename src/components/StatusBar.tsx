import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  message?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ message }) => (
  <Box paddingX={1}>
    <Text dimColor>
      {message ?? "Ctrl+P provider · Ctrl+A accounts · / commands · Ctrl+C exit"}
    </Text>
  </Box>
);
