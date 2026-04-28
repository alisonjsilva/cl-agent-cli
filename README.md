# cl-agent-cli — Commerce Layer CLI Agent

Interactive terminal agent for [Commerce Layer](https://commercelayer.io). Query and manage orders, customers, SKUs, shipments, payments, and more using natural language — powered by the AI provider of your choice.

## Features

- **Multi-provider AI** — Anthropic, OpenAI, Google, OpenRouter, Vercel AI Gateway
- **Built-in Commerce Layer tools** — List, search, and mutate resources directly
- **Multi-account support** — Switch between production, staging, and test environments
- **Environment awareness** — Color-coded badges (red=prod, yellow=staging, green=test)
- **Mutation confirmation** — Interactive y/n dialog before any data modification
- **Optional MCP servers** — Connect to external MCP servers for additional tools
- **Streaming responses** — Real-time token streaming in the terminal

## Install

```bash
npm install -g cl-agent-cli
```

Or run directly:

```bash
npx cl-agent-cli
```

## Quick Start

```bash
cl-agent
```

On first run, the setup wizard guides you through:

1. **LLM provider** — Choose Anthropic, OpenAI, Google, OpenRouter, or Vercel AI Gateway
2. **API key** — Your provider API key
3. **Model** — Select or type a model ID
4. **CL account** — Name, endpoint, and authentication

## Configuration

Config is stored at `~/.config/cl-agent/config.json` (mode 0600).

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "providers": {
    "anthropic": { "apiKey": "sk-ant-..." },
    "openai": { "apiKey": "sk-..." },
    "openrouter": { "apiKey": "sk-or-..." }
  },
  "activeAccount": "production",
  "accounts": {
    "production": {
      "baseEndpoint": "https://myorg.commercelayer.io",
      "clientId": "...",
      "clientSecret": "..."
    },
    "staging": {
      "baseEndpoint": "https://myorg-staging.commercelayer.io",
      "clientId": "...",
      "scope": "market:id:xYZkjABcde"
    }
  },
  "mcpServers": {}
}
```

## Commands

| Command | Description |
|---|---|
| `/provider` | Switch LLM provider (interactive menu) |
| `/model <id>` | Set model ID |
| `/models` | List suggested models for current provider |
| `/account` | Manage CL accounts (add/switch/remove) |
| `/key <apiKey>` | Set API key for current provider |
| `/settings` | Open settings view |
| `/config` | Show current config (secrets redacted) |
| `/clear` | Clear chat history |
| `/help` | Show all commands |
| `/quit` | Exit |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+P` | Open provider settings |
| `Ctrl+A` | Open account manager |
| `Ctrl+C` | Exit |

## MCP Server Support

Add external MCP servers to your config:

```json
{
  "mcpServers": {
    "commerce-layer": {
      "command": "npx",
      "args": ["@commercelayer/mcp-server"],
      "env": { "CL_ACCESS_TOKEN": "..." }
    },
    "custom": {
      "url": "https://my-mcp-server.com/mcp"
    }
  }
}
```

MCP tools are merged with built-in tools. On name conflicts, MCP tools take precedence.

## AI Providers

| Provider | Package | Notes |
|---|---|---|
| Anthropic | `@ai-sdk/anthropic` | Claude models |
| OpenAI | `@ai-sdk/openai` | GPT models |
| Google | `@ai-sdk/google` | Gemini models |
| OpenRouter | `@openrouter/ai-sdk-provider` | Multi-provider gateway |
| Vercel AI Gateway | `@ai-sdk/gateway` | Vercel managed gateway |

## Debug Logging

Set `CL_AGENT_DEBUG=1` to enable debug logging to `~/.config/cl-agent/debug.log`:

```bash
CL_AGENT_DEBUG=1 cl-agent
```

## Development

```bash
git clone https://github.com/alisonjsilva/cl-agent-cli.git
cd cl-agent-cli
npm install
npm run build
node build/index.js
```

## Standalone Binary

With [Bun](https://bun.sh) installed:

```bash
npm run compile
./cl-agent
```

## License

MIT
