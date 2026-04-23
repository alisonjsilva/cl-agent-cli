import React from "react";
import { Box, Text } from "ink";
import { EnvBadge } from "./EnvBadge.js";
import { EnvironmentType } from "../config/schema.js";

interface HeaderBarProps {
  account: string | null;
  provider: string;
  model: string;
  env: EnvironmentType;
  toolsCount: number;
  busy: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  account,
  provider,
  model,
  env,
  toolsCount,
  busy,
}) => {
  return (
    <Box
      borderStyle="round"
      borderColor={env === "production" ? "red" : env === "staging" ? "yellow" : "green"}
      flexDirection="column"
      paddingX={1}
      width="100%"
    >
      <Box justifyContent="space-between">
        <Box gap={1}>
          <Text color="green" bold>Commerce Layer Agent</Text>
          <EnvBadge env={env} />
        </Box>
        <Text color={busy ? "yellow" : "gray"}>
          {busy ? "thinking…" : `${toolsCount} tools`}
        </Text>
      </Box>
      <Box gap={1} marginTop={1}>
        <Pill label="provider" value={provider} color="cyan" />
        <Pill label="model" value={model} color="magenta" />
        <Pill label="account" value={account ?? "none"} color="blue" />
      </Box>
    </Box>
  );
};

const Pill: React.FC<{ label: string; value: string; color: string }> = ({
  label,
  value,
  color,
}) => (
  <Box borderStyle="round" borderColor={color} paddingX={1}>
    <Text color={color}>{label}:</Text>
    <Text> {value}</Text>
  </Box>
);
