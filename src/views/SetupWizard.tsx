import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import {
  ALL_PROVIDERS,
  Config,
  DEFAULT_MODELS,
  MODEL_HINTS,
  PROVIDER_LABELS,
  ProviderName,
} from "../config/schema.js";
import { normalizeEndpoint } from "../config/accounts.js";
import { saveConfig } from "../config/store.js";

type Step =
  | "provider"
  | "apiKey"
  | "model"
  | "accountName"
  | "baseEndpoint"
  | "authMode"
  | "clientId"
  | "clientSecret"
  | "accessToken"
  | "scope"
  | "done";

interface SetupWizardProps {
  initial: Config;
  onDone: (cfg: Config) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ initial, onDone }) => {
  const [cfg, setCfg] = useState<Config>(initial);
  const [step, setStep] = useState<Step>("provider");
  const [input, setInput] = useState("");
  const [authMode, setAuthMode] = useState<"client" | "token">("client");
  const [accountName, setAccountName] = useState("default");
  const [acc, setAcc] = useState({
    baseEndpoint: "",
    clientId: "",
    clientSecret: "",
    accessToken: "",
    scope: "",
  });

  const advance = async (next: Step) => {
    setInput("");
    if (next === "done") {
      const finalCfg: Config = {
        ...cfg,
        activeAccount: accountName,
        accounts: {
          ...cfg.accounts,
          [accountName]: {
            baseEndpoint: normalizeEndpoint(acc.baseEndpoint),
            clientId: authMode === "client" ? acc.clientId : undefined,
            clientSecret:
              authMode === "client" && acc.clientSecret
                ? acc.clientSecret
                : undefined,
            accessToken: authMode === "token" ? acc.accessToken : undefined,
            scope: acc.scope || undefined,
          },
        },
      };
      await saveConfig(finalCfg);
      onDone(finalCfg);
      return;
    }
    setStep(next);
  };

  const handleSubmit = (v: string) => {
    const value = v.trim();
    switch (step) {
      case "provider": {
        const p = (ALL_PROVIDERS.includes(value as ProviderName)
          ? value
          : "anthropic") as ProviderName;
        setCfg({ ...cfg, provider: p, model: DEFAULT_MODELS[p] });
        advance("apiKey");
        break;
      }
      case "apiKey":
        if (value) {
          setCfg({
            ...cfg,
            providers: {
              ...cfg.providers,
              [cfg.provider]: { ...cfg.providers[cfg.provider], apiKey: value },
            },
          });
        }
        advance("model");
        break;
      case "model":
        if (value) setCfg({ ...cfg, model: value });
        advance("accountName");
        break;
      case "accountName":
        setAccountName(value || "default");
        advance("baseEndpoint");
        break;
      case "baseEndpoint":
        setAcc({ ...acc, baseEndpoint: value });
        advance("authMode");
        break;
      case "authMode": {
        const mode = value.startsWith("t") ? "token" : "client";
        setAuthMode(mode);
        advance(mode === "token" ? "accessToken" : "clientId");
        break;
      }
      case "clientId":
        setAcc({ ...acc, clientId: value });
        advance("clientSecret");
        break;
      case "clientSecret":
        setAcc({ ...acc, clientSecret: value });
        advance("scope");
        break;
      case "accessToken":
        setAcc({ ...acc, accessToken: value });
        advance("scope");
        break;
      case "scope":
        setAcc({ ...acc, scope: value });
        advance("done");
        break;
    }
  };

  const providerChoices = ALL_PROVIDERS.join(" | ");
  const keyHint =
    cfg.provider === "vercel"
      ? "AI Gateway API key (or Enter to use AI_GATEWAY_API_KEY env)"
      : `API key for ${cfg.provider}`;
  const modelHints = MODEL_HINTS[cfg.provider] ?? [];
  const modelHintText = modelHints.length
    ? `e.g. ${modelHints.slice(0, 2).join(", ")}`
    : undefined;

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green" bold>Commerce Layer Agent — Setup</Text>
      <Text color="gray">Config saved to ~/.config/cl-agent/config.json (chmod 600)</Text>
      <Box marginTop={1} flexDirection="column">
        {step === "provider" && (
          <Box flexDirection="column">
            <Ask label={`LLM provider? (${providerChoices})`} hint="default: anthropic" input={input} onChange={setInput} onSubmit={handleSubmit} />
            <Box marginTop={1} flexDirection="column" paddingLeft={2}>
              {ALL_PROVIDERS.map((p) => (
                <Text key={p} color="gray">  {p.padEnd(12)} {PROVIDER_LABELS[p]}</Text>
              ))}
            </Box>
          </Box>
        )}
        {step === "apiKey" && <Ask label={keyHint} input={input} onChange={setInput} onSubmit={handleSubmit} />}
        {step === "model" && (
          <Ask
            label="Model ID?"
            hint={`Enter for default: ${cfg.model}${modelHintText ? ` (${modelHintText})` : ""}`}
            input={input}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        )}
        {step === "accountName" && <Ask label="Name for this CL account?" hint="e.g. prod, staging, default" input={input} onChange={setInput} onSubmit={handleSubmit} />}
        {step === "baseEndpoint" && <Ask label="CL base endpoint?" hint="e.g. yourdomain or yourdomain.commercelayer.io" input={input} onChange={setInput} onSubmit={handleSubmit} />}
        {step === "authMode" && <Ask label="Auth mode? (client | token)" hint="client = OAuth client credentials" input={input} onChange={setInput} onSubmit={handleSubmit} />}
        {step === "clientId" && <Ask label="Client ID?" input={input} onChange={setInput} onSubmit={handleSubmit} />}
        {step === "clientSecret" && <Ask label="Client Secret?" hint="leave blank for sales-channel (public) client" input={input} onChange={setInput} onSubmit={handleSubmit} />}
        {step === "accessToken" && <Ask label="Access Token?" input={input} onChange={setInput} onSubmit={handleSubmit} />}
        {step === "scope" && <Ask label="Scope? (optional)" hint="e.g. market:id:xYZkjABcde" input={input} onChange={setInput} onSubmit={handleSubmit} />}
      </Box>
    </Box>
  );
};

const Ask: React.FC<{
  label: string;
  hint?: string;
  input: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}> = ({ label, hint, input, onChange, onSubmit }) => (
  <Box flexDirection="column">
    <Text><Text color="cyan" bold>? </Text>{label}</Text>
    {hint && <Text color="gray">  {hint}</Text>}
    <Box>
      <Text color="cyan">{"› "}</Text>
      <TextInput value={input} onChange={onChange} onSubmit={onSubmit} />
    </Box>
  </Box>
);
