# cl-agent-cli

[![npm](https://img.shields.io/npm/v/cl-agent-cli)](https://www.npmjs.com/package/cl-agent-cli)

Open-source terminal agent for [Commerce Layer](https://commercelayer.io). It gives you a local, interactive CLI for exploring and operating Commerce Layer resources with natural language, while keeping mutations behind explicit confirmation prompts.

## Highlights

- Multi-provider LLM support: Anthropic, OpenAI, Google, OpenRouter, Vercel AI Gateway, and NVIDIA NIM
- Built-in Commerce Layer tools for listing, searching, and mutating resources
- Built-in Commerce Layer docs search via the official docs MCP server, with a local fallback when the MCP is unavailable
- Multi-account setup for production, staging, and test environments
- Local-first config stored on disk with secret redaction in UI output
- Optional MCP servers for extending the agent with external tools
- Ink-based full-screen terminal UI with streamed responses

## Requirements

- Node.js 20 or newer
- A Commerce Layer organization endpoint
- One of these Commerce Layer auth methods:
  - OAuth client credentials
  - Access token
- An API key for your selected LLM provider
  - Vercel AI Gateway can also use `AI_GATEWAY_API_KEY` from the environment
- Bun is optional and only needed for building the standalone binary

## Install

Global install:

```bash
npm install -g cl-agent-cli
```

Run without installing:

```bash
npx cl-agent-cli
```

Alternative runners:

```bash
pnpm dlx cl-agent-cli
bunx cl-agent-cli
```

## Quick Start

Start the CLI:

```bash
cl-agent
```

On first run the setup wizard asks for:

1. LLM provider
2. Provider API key, unless you are using Vercel AI Gateway via `AI_GATEWAY_API_KEY`
3. Model ID
4. Commerce Layer account name
5. Commerce Layer endpoint
6. Auth mode: `client` or `token`
7. Optional scope

## Example Prompts

- `Show the latest 10 orders for the active account`
- `Find customers whose email contains example.com`
- `Look up a SKU by code and show its inventory models`
- `Cancel order abc123 if it is still pending`
- `Search the Commerce Layer docs for market scopes`

## Slash Commands

| Command | Description |
|---|---|
| `/help` | Show the available commands |
| `/model <id>` | Set the current model. With no argument, opens settings |
| `/models` | List suggested models for the active provider |
| `/account` / `/accounts` | Open the account manager |
| `/provider` / `/settings` | Open provider and model settings |
| `/key <apiKey>` | Set the API key for the active provider |
| `/config` | Print the current config with secrets redacted |
| `/docs [on\|off]` | Toggle Commerce Layer docs MCP semantic search (default: on) |
| `/clear` | Clear the current chat session |
| `/quit` / `/exit` | Exit the app |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+P` | Open provider settings |
| `Ctrl+A` | Open the account manager |
| `Esc` | Go back from settings or account management views |
| `Ctrl+C` | Exit the process |

## Configuration

Configuration is saved at:

- `$XDG_CONFIG_HOME/cl-agent/config.json` when `XDG_CONFIG_HOME` is set
- `~/.config/cl-agent/config.json` otherwise

The file is written with mode `0600`.

Example:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-..."
    },
    "vercel": {
      "apiKey": "...optional when AI_GATEWAY_API_KEY is set..."
    },
    "nvidia": {
      "apiKey": "nvapi-...",
      "baseURL": "https://integrate.api.nvidia.com/v1"
    }
  },
  "activeAccount": "default",
  "accounts": {
    "default": {
      "baseEndpoint": "https://your-org.commercelayer.io",
      "clientId": "...",
      "clientSecret": "...",
      "scope": "market:id:xYZkjABcde"
    }
  },
  "mcpServers": {},
  "docsAskEnabled": true
}
```

Notes:

- `providers.<name>.model` is stored per provider so switching providers can restore the last model used for that provider
- `providers.<name>.baseURL` is optional for providers that support custom endpoints
- New configs default `docsAskEnabled` to `true`, which enables semantic search through the official Commerce Layer docs MCP server and falls back to local keyword search if the MCP is unreachable
- Accounts can use either OAuth client credentials or a raw access token

## MCP Server Support

You can attach MCP servers through config and have their tools merged into the same agent session.

```json
{
  "mcpServers": {
    "commerce-layer": {
      "command": "npx",
      "args": ["@commercelayer/mcp-server"],
      "env": {
        "CL_ACCESS_TOKEN": "..."
      }
    },
    "custom": {
      "url": "https://my-mcp-server.example.com/mcp"
    }
  }
}
```

The CLI supports both stdio and SSE MCP servers. Destructive MCP tools are wrapped with the same confirmation flow used by built-in Commerce Layer mutations.

## Safety And Security

- Mutating actions require explicit confirmation before execution
- API keys, access tokens, and client secrets are redacted in user-visible config output
- Non-`*.commercelayer.io` endpoints are blocked unless an account opts into `allowCustomEndpoint`
- OAuth tokens are cached in memory only, with bounded lifetime and concurrent refresh deduplication
- MCP subprocesses receive an allowlisted environment rather than the full process environment
- Auth failures and unhandled errors are sanitized before they are logged or displayed

## Development

Clone and run locally:

```bash
git clone https://github.com/alisonjsilva/cl-agent-cli.git
cd cl-agent-cli
pnpm install
npm run build
npm start
```

Available scripts:

```bash
npm run build        # TypeScript compile and make build/index.js executable
npm run dev          # Watch mode for TypeScript
npm start            # Run the built CLI
npm run compile      # Bun standalone binary build
```

Standalone binary:

```bash
npm run compile
./cl-agent
```

There is currently no dedicated test runner or linter in the repository, so `npm run build` is the main validation step.

## Project Layout

- `src/ai/` agent loop, provider wiring, and system prompt
- `src/config/` persisted config schema and storage
- `src/tools/` Commerce Layer, docs, and MCP tool registration
- `src/views/` full-screen Ink views for chat, settings, accounts, and setup
- `src/components/` reusable terminal UI components
- `src/hooks/` app state and keyboard shortcuts

## Contributing

Issues and pull requests are welcome. Keep changes focused, preserve the confirmation and secret-redaction safeguards, and run `npm run build` before opening a PR.

## License

MIT
