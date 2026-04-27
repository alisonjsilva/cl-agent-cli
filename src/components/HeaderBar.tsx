import React from "react";
import { Box, Text } from "ink";
import { EnvBadge } from "./EnvBadge.js";
import { EnvironmentType } from "../config/schema.js";

const ENV_COLORS: Record<EnvironmentType, string> = {
  production: "red",
  staging: "yellow",
  test: "green",
  unknown: "gray",
};

interface HeaderBarProps {
  account: string | null;
  provider: string;
  model: string;
  env: EnvironmentType;
  toolsCount: number;
  busy: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = React.memo(({
  account,
  provider,
  model,
  env,
  toolsCount,
  busy,
}) => {
  const borderColor = ENV_COLORS[env];

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width="100%"
      justifyContent="space-between"
    >
      <Box gap={1}>
        <Text color="green" bold>CL Agent</Text>
        <EnvBadge env={env} />
        <Text dimColor>│</Text>
        <Text dimColor>model </Text>
        <Text color="magenta">{model}</Text>
        <Text dimColor>│</Text>
        <Text dimColor>account </Text>
        <Text color="blue">{account ?? "none"}</Text>
      </Box>
      <Box gap={1}>
        {busy ? (
          <Text color="yellow">● working</Text>
        ) : (
          <Text dimColor>{toolsCount} tools</Text>
        )}
      </Box>
    </Box>
  );
});
