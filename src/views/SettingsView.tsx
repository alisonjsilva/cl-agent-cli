import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Select } from "@inkjs/ui";
import { useConfig } from "../hooks/useConfig.js";
import { redactSecrets } from "../utils/formatting.js";
import {
  ALL_PROVIDERS,
  DEFAULT_MODELS,
  MODEL_HINTS,
  PROVIDER_LABELS,
  ProviderName,
} from "../config/schema.js";

interface SettingsViewProps {
  onBack: () => void;
}

type SettingsStep = "menu" | "provider" | "api_key" | "model" | "custom_model";

function isProviderReady(
  providers: Record<string, { apiKey?: string; model?: string }>,
  provider: ProviderName,
): boolean {
  const pc = providers[provider];
  const hasKey = !!pc?.apiKey || (provider === "vercel" && !!process.env.AI_GATEWAY_API_KEY);
  const hasModel = !!pc?.model;
  return hasKey && hasModel;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const { cfg, update } = useConfig();
  const [step, setStep] = useState<SettingsStep>("menu");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<ProviderName | null>(null);
  const [pendingApiKey, setPendingApiKey] = useState<string | undefined>(undefined);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");

  const targetProvider = pendingProvider ?? cfg.provider;
  const targetProviderCfg = cfg.providers[targetProvider];
  const currentKey = pendingApiKey ?? targetProviderCfg?.apiKey;

  useInput((_input, key) => {
    if (key.escape) {
      switch (step) {
        case "menu":
          onBack();
          break;
        case "provider":
          setStep("menu");
          break;
        case "api_key":
          if (pendingProvider) {
            setApiKeyError(null);
            setPendingApiKey(undefined);
            setStep("provider");
          } else {
            setApiKeyError(null);
            setStep("menu");
          }
          break;
        case "model":
          if (pendingProvider) {
            setStep("api_key");
          } else {
            setStep("menu");
          }
          break;
        case "custom_model":
          setStep("model");
          break;
      }
    }
  });

  const buildProvidersCfg = () => {
    const updated = { ...cfg.providers };

    updated[cfg.provider] = {
      ...updated[cfg.provider],
      model: cfg.model,
    };

    return updated;
  };

  const quickSwitch = async (provider: ProviderName) => {
    const updated = buildProvidersCfg();
    const savedModel = updated[provider]?.model ?? DEFAULT_MODELS[provider];

    await update({
      ...cfg,
      provider,
      model: savedModel,
      providers: updated,
    });

    setMessage(`Switched to ${PROVIDER_LABELS[provider]} / ${savedModel}`);
    setPendingProvider(null);
    setPendingApiKey(undefined);
    setStep("menu");
  };

  const saveAll = async (model: string) => {
    const newProvider = targetProvider;
    const updated = buildProvidersCfg();

    updated[newProvider] = {
      ...updated[newProvider],
      model,
    };

    if (pendingApiKey !== undefined) {
      updated[newProvider] = {
        ...updated[newProvider],
        apiKey: pendingApiKey,
      };
    }

    await update({
      ...cfg,
      provider: newProvider,
      model,
      providers: updated,
    });

    const parts: string[] = [];
    if (pendingProvider && pendingProvider !== cfg.provider) parts.push(`Provider → ${PROVIDER_LABELS[newProvider]}`);
    if (pendingApiKey !== undefined) parts.push("API key saved");
    parts.push(`Model → ${model}`);
    setMessage(parts.join(", "));

    setPendingProvider(null);
    setPendingApiKey(undefined);
    setStep("menu");
  };

  // ── Provider selection ──
  if (step === "provider") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>Select LLM Provider</Text>
        <Text dimColor>Current: {PROVIDER_LABELS[cfg.provider]} — Esc to go back</Text>
        <Box marginTop={1}>
          <Select
            options={ALL_PROVIDERS.map((p) => {
              const pc = cfg.providers[p];
              const isCurrent = p === cfg.provider;
              const tag = isCurrent ? "* " : "  ";
              const ready = isProviderReady(cfg.providers, p);

              let status = "";
              if (ready) {
                const savedModel = pc?.model ?? DEFAULT_MODELS[p];
                status = ` [${savedModel}]`;
              } else if (pc?.apiKey) {
                status = " (no model)";
              } else if (p === "vercel" && process.env.AI_GATEWAY_API_KEY) {
                status = " (env key, no model)";
              } else {
                status = " (not configured)";
              }

              return {
                label: `${tag}${PROVIDER_LABELS[p]}${status}`,
                value: p,
              };
            })}
            defaultValue={cfg.provider}
            onChange={(value) => {
              const p = value as ProviderName;

              if (p !== cfg.provider && isProviderReady(cfg.providers, p)) {
                quickSwitch(p);
                return;
              }

              setPendingProvider(p);
              setPendingApiKey(undefined);
              setApiKeyInput("");
              setApiKeyError(null);
              setCustomModel(targetProviderCfg?.model ?? DEFAULT_MODELS[p]);
              setStep("api_key");
            }}
          />
        </Box>
        <Text dimColor>Configured providers switch instantly.</Text>
      </Box>
    );
  }

  // ── API key entry ──
  if (step === "api_key") {
    const providerLabel = PROVIDER_LABELS[targetProvider];
    const existingKey = targetProviderCfg?.apiKey;
    const hasExisting = !!existingKey;
    const isVercel = targetProvider === "vercel";

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>API Key — {providerLabel}</Text>

        {hasExisting ? (
          <Box flexDirection="column">
            <Box>
              <Text dimColor>Current key: </Text>
              <Text color="yellow">{redactSecrets(existingKey)}</Text>
            </Box>
            <Text dimColor>Press Enter to keep it, or type a new key. Esc to go back.</Text>
          </Box>
        ) : isVercel ? (
          <Box flexDirection="column">
            <Text dimColor>
              {process.env.AI_GATEWAY_API_KEY
                ? "Using AI_GATEWAY_API_KEY from environment."
                : "No key set. You can set one here or use AI_GATEWAY_API_KEY env var."}
            </Text>
            <Text dimColor>Press Enter to skip, or type a key. Esc to go back.</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text color="yellow">No API key configured for {providerLabel}.</Text>
            <Text dimColor>Paste your key and press Enter. Esc to go back.</Text>
          </Box>
        )}

        {apiKeyError && (
          <Box marginTop={1}>
            <Text color="red">{apiKeyError}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color="cyan">{"› "}</Text>
          <TextInput
            value={apiKeyInput}
            onChange={(val) => {
              setApiKeyInput(val);
              setApiKeyError(null);
            }}
            onSubmit={(value) => {
              const key = value.trim();
              const canSkip = hasExisting || isVercel;

              if (!key && !canSkip) {
                setApiKeyError("API key is required for this provider.");
                return;
              }

              if (key) {
                setPendingApiKey(key);
              }

              setApiKeyInput("");
              setApiKeyError(null);

              if (pendingProvider) {
                setStep("model");
              } else {
                if (key) {
                  const updated = { ...cfg.providers };
                  updated[targetProvider] = { ...updated[targetProvider], apiKey: key };
                  update({ ...cfg, providers: updated });
                  setMessage(`API key updated for ${providerLabel}`);
                } else {
                  setMessage("API key unchanged.");
                }
                setStep("menu");
              }
            }}
            placeholder={hasExisting ? "press Enter to keep current key" : isVercel ? "press Enter to skip" : "sk-…"}
          />
        </Box>
      </Box>
    );
  }

  // ── Model selection ──
  if (step === "model") {
    const hints = MODEL_HINTS[targetProvider] ?? [];
    const savedModel = targetProviderCfg?.model;
    const options = [
      ...hints.map((m) => {
        const isSaved = m === savedModel;
        const isCurrent = m === cfg.model && targetProvider === cfg.provider;
        const tag = isCurrent ? "* " : isSaved ? "» " : "  ";
        const hint = isCurrent ? " (current)" : isSaved ? " (saved)" : "";
        return { label: `${tag}${m}${hint}`, value: m };
      }),
      { label: "  [type a custom model ID…]", value: "__custom__" },
    ];

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>
          Select Model — {PROVIDER_LABELS[targetProvider]}
        </Text>
        <Text dimColor>Esc to go back</Text>
        <Box marginTop={1}>
          <Select
            options={options}
            onChange={async (value) => {
              if (value === "__custom__") {
                setCustomModel("");
                setStep("custom_model");
                return;
              }
              await saveAll(value);
            }}
          />
        </Box>
      </Box>
    );
  }

  // ── Custom model entry ──
  if (step === "custom_model") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>
          Enter Model ID — {PROVIDER_LABELS[targetProvider]}
        </Text>
        <Text dimColor>Type any valid model ID, then press Enter. Esc to go back.</Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="cyan">{"› "}</Text>
            <TextInput
              value={customModel}
              onChange={setCustomModel}
              onSubmit={async (value) => {
                const model = value.trim();
                if (!model) return;
                await saveAll(model);
                setCustomModel("");
              }}
              placeholder="e.g. claude-opus-4-20250514"
            />
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Suggestions for {PROVIDER_LABELS[targetProvider]}:</Text>
            {(MODEL_HINTS[targetProvider] ?? []).map((m) => (
              <Text key={m} color="gray">  {m}</Text>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  // ── Settings menu ──
  const activeKey = cfg.providers[cfg.provider]?.apiKey;
  const keyStatus = activeKey
    ? redactSecrets(activeKey)
    : cfg.provider === "vercel" && process.env.AI_GATEWAY_API_KEY
      ? "via env"
      : "not set";

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>Settings</Text>
      <Text dimColor>
        Provider: {PROVIDER_LABELS[cfg.provider]} / Model: {cfg.model}
      </Text>
      <Text dimColor>API Key: {keyStatus}</Text>
      {message && <Text color="cyan">{message}</Text>}
      <Box marginTop={1}>
        <Select
          options={[
            { label: "Switch Provider", value: "provider" },
            { label: "Change Model", value: "model" },
            { label: "Change API Key", value: "api_key" },
            { label: "Back to Chat", value: "back" },
          ]}
          onChange={(value) => {
            setMessage(null);
            if (value === "back") {
              onBack();
            } else if (value === "api_key") {
              setPendingProvider(null);
              setPendingApiKey(undefined);
              setApiKeyInput("");
              setApiKeyError(null);
              setStep("api_key");
            } else if (value === "model") {
              setPendingProvider(null);
              setPendingApiKey(undefined);
              setStep("model");
            } else {
              setStep(value as SettingsStep);
            }
          }}
        />
      </Box>
      <Text dimColor>Esc to go back</Text>
    </Box>
  );
};
