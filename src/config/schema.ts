export type ProviderName = "anthropic" | "openai" | "google" | "openrouter" | "vercel";

export const ALL_PROVIDERS: ProviderName[] = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "vercel",
];

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
  openrouter: "OpenRouter (multi-provider)",
  vercel: "Vercel AI Gateway",
};

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  openrouter: "anthropic/claude-sonnet-4",
  vercel: "anthropic/claude-sonnet-4.6",
};

export const MODEL_HINTS: Record<ProviderName, string[]> = {
  anthropic: [
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-haiku-3-5-20241022",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  google: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
  openrouter: [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4o",
    "google/gemini-2.0-flash",
  ],
  vercel: [
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.4",
    "google/gemini-3-flash",
  ],
};

export type EnvironmentType = "production" | "staging" | "test" | "unknown";

export interface CLAccount {
  label?: string;
  baseEndpoint: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  scope?: string;
  environment?: EnvironmentType;
}

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface Config {
  provider: ProviderName;
  model: string;
  providers: Record<ProviderName, ProviderConfig>;
  activeAccount: string | null;
  accounts: Record<string, CLAccount>;
  mcpServers: Record<string, MCPServerConfig>;
}

export const DEFAULT_CONFIG: Config = {
  provider: "anthropic",
  model: DEFAULT_MODELS.anthropic,
  providers: {
    anthropic: {},
    openai: {},
    google: {},
    openrouter: {},
    vercel: {},
  },
  activeAccount: null,
  accounts: {},
  mcpServers: {},
};
