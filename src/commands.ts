export interface CommandDef {
  name: string;
  description: string;
  args?: string;
}

export const COMMANDS: CommandDef[] = [
  { name: "help", description: "Show all commands" },
  { name: "model", description: "Set model", args: "<id>" },
  { name: "models", description: "List suggested models" },
  { name: "accounts", description: "Manage CL accounts" },
  { name: "key", description: "Set API key", args: "<apiKey>" },
  { name: "settings", description: "Open settings" },
  { name: "config", description: "Show config (redacted)" },
  { name: "clear", description: "Clear chat" },
  { name: "quit", description: "Quit" },
];
