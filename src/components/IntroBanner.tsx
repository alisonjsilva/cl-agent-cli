import React from "react";
import { Box, Text } from "ink";

interface IntroBannerProps {
  version: string;
}

const LOGO = [
  "╔═╗╦    ╔═╗╔═╗╔═╗╔╗╔╔╦╗",
  "║  ║    ╠═╣║ ╦║╣ ║║║ ║ ",
  "╚═╝╩═╝  ╩ ╩╚═╝╚═╝╝╚╝ ╩ ",
];

export const IntroBanner: React.FC<IntroBannerProps> = ({ version }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      <Box flexDirection="column">
        {LOGO.map((line, i) => (
          <Text key={i} color="green">{line}</Text>
        ))}
      </Box>
      <Text color="white" bold>
        CL Agent <Text dimColor>v{version}</Text>
      </Text>
      <Text dimColor>Ask anything about your Commerce Layer data.</Text>
      <Text>{" "}</Text>
      <Text dimColor>Tip: <Text color="cyan">/help</Text> for commands · <Text color="cyan">Esc×2</Text> to cancel · <Text color="cyan">Ctrl+C</Text> to exit</Text>
      <Text dimColor>AI may make mistakes. Not affiliated with Commerce Layer. Use at your own risk.</Text>
    </Box>
  );
};
