# Copilot Instructions — Commerce Layer Agent TUI

## Build & Run

```bash
npm run build        # tsc + chmod 755 build/index.js
npm run dev          # tsc --watch
npm start            # node build/index.js
npm run compile      # bun compile to standalone binary
```

No test runner or linter is configured.

## Architecture

This is an **Ink-based terminal UI** (React rendered to the terminal) that lets users interact with the Commerce Layer API via natural language. It uses the **Vercel AI SDK** (`ai` package) to stream LLM responses and execute tools.

**Core flow:** `index.tsx` → `<App>` (app.tsx) → config loading → view routing → `<ChatView>` with agent loop.

### Layers

- **Config** (`src/config/`): Loads/saves `~/.config/cl-agent/config.json` (mode 0600). `ConfigProvider` context exposes `{ cfg, update }` to the tree. `update` persists to disk.
- **AI** (`src/ai/`): `Agent` class wraps `streamText()` with message history, tool deduplication, and max 10 steps per request. `createModel()` returns a provider-specific model instance. The system prompt is hardened against prompt injection.
- **Tools** (`src/tools/`): Registry merges built-in CL tools + MCP server tools. CL tools use `clFetch()` for JSON:API calls with auto-retry on 429/5xx. Mutations require user confirmation via `requireConfirm()`.
- **Views** (`src/views/`): Full-screen UIs — ChatView, SetupWizard, SettingsView, AccountManager. Navigation via `useRouter` hook (simple state-based routing).
- **Components** (`src/components/`): Reusable Ink components — InputBar, ChatMessage, ConfirmDialog, HeaderBar, EnvBadge, RichText.
- **Hooks** (`src/hooks/`): `useAgent` (agent lifecycle + chat state), `useConfig` (context), `useRouter` (view navigation), `useKeybindings` (Ctrl+P/A shortcuts).

### Key data flows

- **Chat entries** are an immutable array of discriminated unions: `user | assistant | tool_call | tool_result | info | error`. Capped at 120 items.
- **Confirmation flow**: Mutation tools call `requireConfirm()` → UI shows `ConfirmDialog` with resource context → user accepts/declines → `UserDeclinedError` stops the agent if declined.
- **MCP tools**: Connected via stdio or SSE. Destructive MCP tools are auto-detected by regex and wrapped with the same confirmation logic as built-in tools.

## Conventions

### TypeScript & modules

- ES modules with **`.js` extensions in all imports** (required by `"module": "NodeNext"`).
- Strict mode enabled. Zod schemas validate tool inputs at runtime.
- React 18 with `jsx: "react-jsx"` (no explicit React imports needed).

### Tool definitions

Tools follow the Vercel AI SDK pattern:

```typescript
tool({
  description: "...",
  inputSchema: z.object({ /* Zod schema */ }),
  execute: async (params) => { /* returns string or object */ }
})
```

- Read-only tools are prefixed `cl_list_`, `cl_get_`, `cl_search_`.
- Mutation tools include the action verb: `cl_cancel_order`, `cl_capture_payment`, `cl_update_resource`, etc.
- All mutations must call `requireConfirm(confirmFn, toolName, args, context?)` before executing. The `context` parameter should include a human-readable summary of the affected resource.

### API integration

- `clFetch(account, path, options)` handles OAuth tokens (cached with 60-sec expiry buffer), auto-retry, and JSON:API response formatting.
- Filtering uses Commerce Layer's ransack-style syntax (`_eq`, `_cont` suffixes).
- Pagination: `page_size` 1–25, `page_number`. Default sort: `-created_at`.

### Naming

- Components/Views: PascalCase (`ChatView`, `InputBar`)
- Hooks: `use` prefix (`useAgent`, `useConfig`)
- Tool names: `cl_` prefix for Commerce Layer tools
- Config keys: camelCase (`activeAccount`, `baseEndpoint`)

### UI patterns

- Border colors indicate environment risk: **red** = production, **yellow** = staging, **green** = test.
- Dimmed text for secondary info. Input is disabled while a confirmation dialog is pending.
- All sub-views are escapable with Esc.

### Security

- Mutation confirmation dialogs are mandatory — never bypass them.
- API keys and secrets must be redacted in any user-visible config output.
- The system prompt explicitly rejects prompt injection attempts embedded in API data.
- Config file is written with `0o600` permissions.
- **Endpoint validation**: `validateEndpoint()` blocks non-`*.commercelayer.io` domains by default. Accounts can opt in via `allowCustomEndpoint: true`.
- **Token cache**: Per-account keyed cache with 2-hour lifetime cap and concurrent-refresh deduplication. Tokens live in memory only.
- **MCP subprocess isolation**: Stdio MCP servers receive only allowlisted environment variables (PATH, HOME, XDG dirs, proxy/TLS, etc.) — never the full `process.env`.
- **Rate limiting**: API calls (60/min) and auth requests (5/min) are rate-limited via `RateLimiter` in `src/utils/rate-limiter.ts`.
- **Error sanitization**: OAuth failures and unhandled rejections strip secrets (Bearer tokens, API keys, JWTs) before logging or display.
- **Security event logging**: `logSecurityEvent()` in `src/utils/logger.ts` always writes to disk regardless of `CL_AGENT_DEBUG`, for audit-worthy events (blocked endpoints, auth failures).

### Slash commands

Commands are parsed in `handleCommand()` in `app.tsx`. Pattern: `/command [args...]`. Commands either mutate config (and persist), navigate to a view, or append info entries to chat history.
