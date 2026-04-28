# Commerce Layer Agent TUI

Interactive Ink-based terminal UI that lets users manage the Commerce Layer API via natural language. Uses the Vercel AI SDK (`ai` package) to stream LLM responses and execute tools.

## Build & Run

```bash
npm run build        # tsc + chmod 755 build/index.js
npm run dev          # tsc --watch
npm start            # node build/index.js
npm run compile      # bun build --compile to standalone binary
```

No test runner or linter is configured.

## Architecture

**Core flow:** `index.tsx` → `<App>` (app.tsx) → config loading → view routing → `<ChatView>` with agent loop.

### Layers

- **Config** (`src/config/`): Loads/saves `~/.config/cl-agent/config.json` (mode 0600). `ConfigProvider` context exposes `{ cfg, update }` to the tree.
- **AI** (`src/ai/`): `Agent` class wraps `streamText()` with message history, tool deduplication, and max 10 steps per request. `createModel()` returns a provider-specific model instance. System prompt is hardened against prompt injection.
- **Tools** (`src/tools/`): Registry always exposes Commerce Layer docs search, then merges built-in CL tools and optional MCP server tools. CL tools use `clFetch()` for JSON:API calls with auto-retry on 429/5xx. Mutations require user confirmation via `requireConfirm()`.
- **Views** (`src/views/`): Full-screen UIs — ChatView, SetupWizard, SettingsView, AccountManager. Navigation via `useRouter` hook.
- **Components** (`src/components/`): Reusable Ink components — InputBar, ChatMessage, ConfirmDialog, HeaderBar, EnvBadge, RichText.
- **Hooks** (`src/hooks/`): `useAgent` (agent lifecycle + chat state), `useConfig` (context), `useRouter` (view navigation), `useKeybindings` (Ctrl+P/A shortcuts).

### Key data flows

- **Chat entries**: Immutable array of discriminated unions: `user | assistant | tool_call | tool_result | info | error`. Capped at 120 items.
- **Confirmation flow**: Mutation tools call `requireConfirm()` → UI shows `ConfirmDialog` → user accepts/declines → `UserDeclinedError` stops the agent if declined.
- **MCP tools**: Connected via stdio or SSE. Destructive MCP tools are auto-detected by regex and wrapped with confirmation logic.

## TypeScript & Module Conventions

- ES modules with **`.js` extensions in all imports** (required by `"module": "NodeNext"`).
- Strict mode enabled. Zod schemas validate tool inputs at runtime.
- React 18 with `jsx: "react-jsx"` (no explicit React imports needed).
- Components/Views: PascalCase. Hooks: `use` prefix. Tool names: `cl_` prefix. Config keys: camelCase.

## Tool Definition Pattern

Tools follow the Vercel AI SDK pattern:

```typescript
tool({
  description: "...",
  inputSchema: z.object({ /* Zod schema */ }),
  execute: async (params) => { /* returns string or object */ }
})
```

- Read-only tools: `cl_list_`, `cl_get_`, `cl_search_` prefixes.
- Mutation tools: action verb prefix (`cl_cancel_`, `cl_update_`, `cl_delete_`, etc.).
- All mutations must call `requireConfirm(confirmFn, toolName, args, context?)` before executing.

## API Integration

- `clFetch(account, path, options)` handles OAuth tokens (cached with 60-sec expiry buffer), auto-retry, and JSON:API response formatting.
- Filtering uses Commerce Layer's ransack-style syntax (`_eq`, `_cont` suffixes).
- Pagination: `page_size` 1–25, `page_number`. Default sort: `-created_at`.

## Config Notes

- Provider configs also support optional `baseURL` overrides.
- `docsAskEnabled` controls whether docs lookup uses the slower semantic `?ask=` endpoint or the fast keyword fallback.
- `providers.<name>.model` is persisted per provider so settings can restore the last model used for that provider.

## Security Invariants — DO NOT WEAKEN

- Mutation confirmation dialogs are mandatory — never bypass them.
- API keys and secrets must be redacted in any user-visible config output.
- The system prompt rejects prompt injection attempts embedded in API data.
- Config file is written with `0o600` permissions.
- `validateEndpoint()` blocks non-`*.commercelayer.io` domains unless `allowCustomEndpoint: true`.
- Token cache: Per-account keyed, 2-hour lifetime cap, concurrent-refresh deduplication. Memory only.
- MCP subprocess isolation: Stdio servers receive only allowlisted env vars (PATH, HOME, XDG dirs, proxy/TLS) — never full `process.env`.
- Rate limiting: API calls (60/min), auth requests (5/min) via `RateLimiter`.
- Error sanitization: OAuth failures and unhandled rejections strip secrets (Bearer tokens, API keys, JWTs) before logging/display.
- Security event logging: `logSecurityEvent()` always writes to disk for audit events.

## Slash Commands

Commands are parsed in `handleCommand()` in `app.tsx`. Pattern: `/command [args...]`. Commands either mutate config (and persist), navigate to a view, or append info entries to chat history.

- `/help`
- `/model <id>`
- `/models`
- `/account` and `/accounts`
- `/provider` and `/settings`
- `/key <apiKey>`
- `/config`
- `/docs [on|off]`
- `/clear`
- `/quit` and `/exit`

## AI Providers

| Provider | Package | Notes |
|---|---|---|
| Anthropic | `@ai-sdk/anthropic` | Claude models |
| OpenAI | `@ai-sdk/openai` | GPT models |
| Google | `@ai-sdk/google` | Gemini models |
| OpenRouter | `@openrouter/ai-sdk-provider` | Multi-provider gateway |
| Vercel AI Gateway | `@ai-sdk/gateway` | Vercel managed gateway |
| NVIDIA NIM | `@ai-sdk/openai-compatible` | OpenAI-compatible chat models via NIM |
