import React from "react";
import { Box, Text } from "ink";
import { EnvironmentType } from "../config/schema.js";

interface IntroBannerProps {
  version: string;
  provider: string;
  model: string;
  account: string | null;
  env: EnvironmentType;
  toolsCount: number;
}

const LOGO = [
  "   ██████╗██╗            █████╗  ██████╗ ███████╗███╗   ██╗████████╗",
  "  ██╔════╝██║           ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝",
  "  ██║     ██║     █████╗███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ",
  "  ██║     ██║     ╚════╝██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ",
  "  ╚██████╗███████╗      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ",
  "   ╚═════╝╚══════╝      ╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ",
];

const ENV_COLORS: Record<EnvironmentType, string> = {
  production: "red",
  staging: "yellow",
  test: "green",
  unknown: "gray",
};

const TIPS = [
  { key: "Enter", desc: "send message" },
  { key: "/help", desc: "list commands" },
  { key: "/model", desc: "change model" },
  { key: "Ctrl+P", desc: "switch provider" },
  { key: "Ctrl+A", desc: "manage accounts" },
  { key: "Ctrl+C", desc: "exit" },
];

const EXAMPLES = [
  "list the 5 latest orders",
  "show order #107479454",
  "find customer john@example.com",
  "list SKUs with low stock",
];

export const IntroBanner: React.FC<IntroBannerProps> = ({
  version,
  provider,
  model,
  account,
  env,
  toolsCount,
}) => {
  const borderColor = ENV_COLORS[env];

  return (
    <Box flexDirection="column" width="100%">
      {/* Logo */}
      <Box flexDirection="column" paddingX={1}>
        {LOGO.map((line, i) => (
          <Text key={i} color="green">{line}</Text>
        ))}
      </Box>

      {/* Tagline + version */}
      <Box paddingX={2} marginTop={1} gap={1}>
        <Text color="white" bold>Commerce Layer Agent</Text>
        <Text dimColor>v{version}</Text>
        <Text dimColor>—</Text>
        <Text dimColor>AI-powered e-commerce operations from your terminal</Text>
      </Box>

      {/* Session info */}
      <Box
        flexDirection="column"
        marginTop={1}
        marginX={1}
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        paddingY={0}
      >
        <Box gap={1}>
          <Text dimColor>provider</Text>
          <Text color="cyan" bold>{provider}</Text>
          <Text dimColor>│</Text>
          <Text dimColor>model</Text>
          <Text color="magenta" bold>{model}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>account</Text>
          <Text color="blue" bold>{account ?? "none"}</Text>
          <Text dimColor>│</Text>
          <Text dimColor>env</Text>
          <Text color={borderColor} bold>{env}</Text>
          <Text dimColor>│</Text>
          <Text dimColor>tools</Text>
          <Text color="white" bold>{String(toolsCount)}</Text>
        </Box>
      </Box>

      {/* Tips */}
      <Box
        flexDirection="column"
        marginTop={1}
        marginX={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text color="white" bold>Tips</Text>
        <Box flexDirection="column" marginTop={0}>
          {TIPS.map((tip) => (
            <Box key={tip.key} gap={1}>
              <Text color="cyan">{padRight(tip.key, 10)}</Text>
              <Text dimColor>{tip.desc}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Examples */}
      <Box flexDirection="column" marginTop={1} marginX={1} paddingX={1}>
        <Text color="white" bold>Try asking:</Text>
        {EXAMPLES.map((ex) => (
          <Box key={ex} gap={1}>
            <Text color="green">{"  ›"}</Text>
            <Text color="green">{ex}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

function padRight(str: string, len: number): string {
  return str + " ".repeat(Math.max(0, len - str.length));
}
