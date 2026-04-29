import React, { useEffect, useState, useCallback, useRef } from "react";
import { Box, useApp } from "ink";
import type { ToolSet } from "ai";
import { Config } from "./config/schema.js";
import { getActiveAccount, detectEnvironment } from "./config/accounts.js";
import { loadConfig } from "./config/store.js";
import { ConfigProvider, useConfig } from "./hooks/useConfig.js";
import { useRouter } from "./hooks/useRouter.js";
import { useAgent } from "./hooks/useAgent.js";
import { buildToolRegistry } from "./tools/registry.js";
import type { MutationConfirmFn, ConfirmContext } from "./tools/cl-tools.js";
import { HeaderBar } from "./components/HeaderBar.js";
import { InputBar } from "./components/InputBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { ConfirmDialog } from "./components/ConfirmDialog.js";
import { ChatView } from "./views/ChatView.js";
import { SetupWizard } from "./views/SetupWizard.js";
import { SettingsView } from "./views/SettingsView.js";
import { AccountManager } from "./views/AccountManager.js";
import { useKeybindings } from "./hooks/useKeybindings.js";
import { getErrorMessage, isDestructiveToolName } from "./utils/formatting.js";
import { setDocsAskEnabled, getDocsAskEnabled } from "./tools/cl-docs.js";
import { logError } from "./utils/logger.js";

export const App: React.FC = () => {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then(setCfg).catch((err) => setError(getErrorMessage(err)));
  }, []);

  if (error) {
    return <Box padding={1}><StatusBar message={`Error: ${error}`} /></Box>;
  }
  if (!cfg) return null;

  return (
    <ConfigProvider initial={cfg}>
      <AppInner />
    </ConfigProvider>
  );
};

const AppInner: React.FC = () => {
  const { exit } = useApp();
  const { cfg, update } = useConfig();
  const account = getActiveAccount(cfg);
  const hasKey = cfg.provider === "vercel" || !!cfg.providers[cfg.provider]?.apiKey;
  const needsSetup = !hasKey || !account;
  const { view, navigate } = useRouter(needsSetup ? "setup" : "chat");

  const [tools, setTools] = useState<ToolSet>({});
  const [toolCount, setToolCount] = useState(0);
  const toolsLoaded = useRef(false);

  // Confirmation state: set by the confirmFn inside tool execute, resolved by ConfirmDialog UI
  const [pendingConfirm, setPendingConfirm] = useState<{
    toolName: string;
    args: Record<string, unknown>;
    context?: ConfirmContext;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirmRef = useRef<MutationConfirmFn>((toolName, args, context) =>
    new Promise<boolean>((resolve) =>
      setPendingConfirm({ toolName, args, context, resolve }),
    ),
  );

  const loadTools = useCallback(async (nextCfg: Config) => {
    try {
      const reg = await buildToolRegistry(
        nextCfg,
        (name, args, context) => confirmRef.current(name, args, context),
      );
      setTools(reg.tools);
      setToolCount(reg.toolCount);
    } catch (err: unknown) {
      logError("loadTools", err);
    }
  }, []);

  useEffect(() => {
    if (toolsLoaded.current) return;
    if (!account) return;
    toolsLoaded.current = true;
    loadTools(cfg);
  }, [cfg, account, loadTools]);

  const { entries, busy, streamingText, sessionStats, send, clear, append, cancel } = useAgent(cfg, tools);

  const [input, setInput] = useState("");
  const env = account ? detectEnvironment(account) : "unknown";
  const pendingConfirmationWord = pendingConfirm
    ? isDestructiveToolName(pendingConfirm.toolName)
      ? "DELETE"
      : "YES"
    : null;

  useKeybindings({
    navigate,
    disabled: busy || !!pendingConfirm || view !== "chat",
  });

  const handleSubmitRef = useRef<(line: string) => Promise<void>>(async () => {});

  const stableSubmit = useCallback((line: string) => {
    handleSubmitRef.current(line);
  }, []);

  handleSubmitRef.current = async (line: string) => {
    if (!line.trim()) return;
    setInput("");

    if (line.startsWith("/")) {
      await handleCommand(line);
      return;
    }

    if (view !== "chat") navigate("chat");
    await send(line);
  };

  const handleCommand = async (line: string) => {
    const [cmd, ...rest] = line.slice(1).trim().split(/\s+/);
    const arg = rest.join(" ");

    switch (cmd) {
      case "help":
        append({
          kind: "info",
          text: `Commands:
  /model <id>        Set model
  /models            List suggested models
  /accounts          Manage CL accounts
  /key <apiKey>      Set API key for current provider
  /settings          Open settings (provider, model, etc.)
  /config            Show config (redacted)
  /docs [on|off]     Toggle docs MCP semantic search (default: on)
  /clear             Clear chat
  /quit              Quit`,
        });
        break;

      case "quit":
      case "exit":
        exit();
        break;

      case "clear":
        clear();
        append({ kind: "info", text: "Chat cleared." });
        break;

      case "provider":
        navigate("settings");
        break;

      case "model":
        if (arg) {
          const updatedProviders = { ...cfg.providers };
          updatedProviders[cfg.provider] = {
            ...updatedProviders[cfg.provider],
            model: arg,
          };
          await update({ ...cfg, model: arg, providers: updatedProviders });
          append({ kind: "info", text: `Model → ${arg}` });
        } else {
          navigate("settings");
        }
        break;

      case "models": {
        const { MODEL_HINTS } = await import("./config/schema.js");
        const hints = MODEL_HINTS[cfg.provider] ?? [];
        append({
          kind: "info",
          text: `Models for ${cfg.provider}:\n${hints.map((m) => `  ${m === cfg.model ? "* " : "  "}${m}`).join("\n")}\n\nCurrent: ${cfg.model}`,
        });
        break;
      }

      case "key":
        if (!arg) {
          append({ kind: "error", text: "Usage: /key <apiKey>" });
        } else {
          await update({
            ...cfg,
            providers: {
              ...cfg.providers,
              [cfg.provider]: { ...cfg.providers[cfg.provider], apiKey: arg },
            },
          });
          append({ kind: "info", text: `API key updated for ${cfg.provider}` });
        }
        break;

      case "account":
      case "accounts":
        navigate("accounts");
        break;

      case "settings":
        navigate("settings");
        break;

      case "docs": {
        const current = getDocsAskEnabled();
        const next = arg === "on" ? true : arg === "off" ? false : !current;
        setDocsAskEnabled(next);
        await update({ ...cfg, docsAskEnabled: next });
        append({
          kind: "info",
          text: next
            ? "Docs MCP ON — semantic search via official Commerce Layer docs MCP server."
            : "Docs MCP OFF — using local keyword/URL fallback only.",
        });
        break;
      }

      case "config": {
        const redacted = JSON.parse(JSON.stringify(cfg));
        for (const p of Object.keys(redacted.providers)) {
          if (redacted.providers[p]?.apiKey) redacted.providers[p].apiKey = "***";
        }
        for (const a of Object.keys(redacted.accounts)) {
          if (redacted.accounts[a]?.clientSecret) redacted.accounts[a].clientSecret = "***";
          if (redacted.accounts[a]?.accessToken) redacted.accounts[a].accessToken = "***";
        }
        append({ kind: "info", text: JSON.stringify(redacted, null, 2) });
        break;
      }

      default:
        append({ kind: "error", text: `Unknown command: /${cmd}. Try /help` });
    }
  };

  if (view === "setup") {
    return (
      <SetupWizard
        initial={cfg}
        onDone={async (c) => {
          await update(c);
          toolsLoaded.current = false;
          await loadTools(c);
          navigate("chat");
        }}
      />
    );
  }

  if (view === "settings") {
    return <SettingsView onBack={() => navigate("chat")} />;
  }

  if (view === "accounts") {
    return (
      <AccountManager
        onBack={async () => {
          toolsLoaded.current = false;
          await loadTools(cfg);
          navigate("chat");
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <HeaderBar
        account={cfg.activeAccount}
        provider={cfg.provider}
        model={cfg.model}
        env={env}
        toolsCount={toolCount}
        busy={busy}
      />

      <ChatView
        entries={entries}
        busy={busy}
        streamingText={streamingText}
        sessionStats={sessionStats}
      />

      {pendingConfirm && (
        <ConfirmDialog
          toolName={pendingConfirm.toolName}
          args={pendingConfirm.args}
          context={pendingConfirm.context}
          onDecide={(ok) => {
            pendingConfirm.resolve(ok);
            setPendingConfirm(null);
          }}
        />
      )}

      <InputBar
        value={input}
        onChange={setInput}
        onSubmit={stableSubmit}
        onCancel={cancel}
        busy={busy}
        disabled={!!pendingConfirm}
        placeholder={
          pendingConfirmationWord
            ? `Awaiting confirmation — type ${pendingConfirmationWord} in dialog…`
            : undefined
        }
        account={cfg.activeAccount}
        env={env}
      />

      <StatusBar />
    </Box>
  );
};
