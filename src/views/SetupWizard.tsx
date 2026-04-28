import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Select } from "@inkjs/ui";
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

type Phase = "llm" | "account";
type Step =
  | "welcome"
  | "provider"
  | "apiKey"
  | "model"
  | "customModel"
  | "accountName"
  | "baseEndpoint"
  | "authMode"
  | "clientId"
  | "clientSecret"
  | "accessToken"
  | "scope"
  | "done";

const STEP_META: Record<Step, { phase: Phase; index: number; label: string }> = {
  welcome:       { phase: "llm",     index: 0, label: "Welcome" },
  provider:      { phase: "llm",     index: 1, label: "Provider" },
  apiKey:        { phase: "llm",     index: 2, label: "API Key" },
  model:         { phase: "llm",     index: 3, label: "Model" },
  customModel:   { phase: "llm",     index: 3, label: "Model" },
  accountName:   { phase: "account", index: 4, label: "Account" },
  baseEndpoint:  { phase: "account", index: 5, label: "Endpoint" },
  authMode:      { phase: "account", index: 6, label: "Auth" },
  clientId:      { phase: "account", index: 7, label: "Credentials" },
  clientSecret:  { phase: "account", index: 7, label: "Credentials" },
  accessToken:   { phase: "account", index: 7, label: "Credentials" },
  scope:         { phase: "account", index: 8, label: "Scope" },
  done:          { phase: "account", index: 9, label: "Done" },
};

const TOTAL_STEPS = 9;

interface SetupWizardProps {
  initial: Config;
  onDone: (cfg: Config) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ initial, onDone }) => {
  const [cfg, setCfg] = useState<Config>(initial);
  const [step, setStep] = useState<Step>("welcome");
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

  const meta = STEP_META[step];

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

  const providerLabel = PROVIDER_LABELS[cfg.provider];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Header />
      {step !== "welcome" && <ProgressBar current={meta.index} total={TOTAL_STEPS} phase={meta.phase} />}
      <Box marginTop={1} flexDirection="column">
        {step === "welcome" && <WelcomeStep onContinue={() => setStep("provider")} />}
        {step === "provider" && (
          <ProviderStep
            current={cfg.provider}
            onSelect={(p) => {
              setCfg({ ...cfg, provider: p, model: DEFAULT_MODELS[p] });
              advance("apiKey");
            }}
          />
        )}
        {step === "apiKey" && (
          <ApiKeyStep
            provider={cfg.provider}
            providerLabel={providerLabel}
            input={input}
            onChange={setInput}
            onSubmit={(key) => {
              if (key) {
                setCfg({
                  ...cfg,
                  providers: {
                    ...cfg.providers,
                    [cfg.provider]: { ...cfg.providers[cfg.provider], apiKey: key },
                  },
                });
              }
              advance("model");
            }}
          />
        )}
        {step === "model" && (
          <ModelStep
            provider={cfg.provider}
            providerLabel={providerLabel}
            currentModel={cfg.model}
            onSelect={(model) => {
              if (model === "__custom__") {
                setStep("customModel");
                return;
              }
              setCfg({ ...cfg, model });
              advance("accountName");
            }}
          />
        )}
        {step === "customModel" && (
          <CustomModelStep
            provider={cfg.provider}
            providerLabel={providerLabel}
            input={input}
            onChange={setInput}
            onSubmit={(model) => {
              if (model) setCfg({ ...cfg, model });
              advance("accountName");
            }}
            onBack={() => setStep("model")}
          />
        )}
        {step === "accountName" && (
          <SectionDivider title="Commerce Layer Account" />
        )}
        {step === "accountName" && (
          <TextStep
            title="Account Name"
            description="A label for this Commerce Layer account configuration."
            hint="e.g. prod, staging, sandbox"
            placeholder="default"
            input={input}
            onChange={setInput}
            onSubmit={(v) => {
              setAccountName(v || "default");
              advance("baseEndpoint");
            }}
          />
        )}
        {step === "baseEndpoint" && (
          <TextStep
            title="Base Endpoint"
            description="Your Commerce Layer organization slug or full domain."
            hint="e.g. my-org or my-org.commercelayer.io"
            input={input}
            onChange={setInput}
            onSubmit={(v) => {
              setAcc({ ...acc, baseEndpoint: v });
              advance("authMode");
            }}
            required
          />
        )}
        {step === "authMode" && (
          <AuthModeStep
            onSelect={(mode) => {
              setAuthMode(mode);
              advance(mode === "token" ? "accessToken" : "clientId");
            }}
          />
        )}
        {step === "clientId" && (
          <TextStep
            title="Client ID"
            description="OAuth application client ID from your Commerce Layer dashboard."
            input={input}
            onChange={setInput}
            onSubmit={(v) => {
              setAcc({ ...acc, clientId: v });
              advance("clientSecret");
            }}
            required
          />
        )}
        {step === "clientSecret" && (
          <TextStep
            title="Client Secret"
            description="Leave blank for sales-channel (public) clients."
            hint="Press Enter to skip"
            input={input}
            onChange={setInput}
            onSubmit={(v) => {
              setAcc({ ...acc, clientSecret: v });
              advance("scope");
            }}
          />
        )}
        {step === "accessToken" && (
          <TextStep
            title="Access Token"
            description="A pre-generated Commerce Layer access token."
            input={input}
            onChange={setInput}
            onSubmit={(v) => {
              setAcc({ ...acc, accessToken: v });
              advance("scope");
            }}
            required
          />
        )}
        {step === "scope" && (
          <TextStep
            title="Scope (optional)"
            description="Restrict access to a specific market or stock location."
            hint="e.g. market:id:xYZkjABcde — press Enter to skip"
            input={input}
            onChange={setInput}
            onSubmit={(v) => {
              setAcc({ ...acc, scope: v });
              advance("done");
            }}
          />
        )}
      </Box>
    </Box>
  );
};

/* ── Sub-components ─────────────────────────────────────────────── */

const Header: React.FC = () => (
  <Box flexDirection="column">
    <Box>
      <Text color="green" bold>{'  ╭─────────────────────────────╮'}</Text>
    </Box>
    <Box>
      <Text color="green" bold>{'  │'}</Text>
      <Text color="white" bold>{'  Commerce Layer Agent  '}</Text>
      <Text color="green" bold>{'│'}</Text>
    </Box>
    <Box>
      <Text color="green" bold>{'  ╰─────────────────────────────╯'}</Text>
    </Box>
  </Box>
);

const ProgressBar: React.FC<{
  current: number;
  total: number;
  phase: Phase;
}> = ({ current, total, phase }) => {
  const filled = Math.max(1, current);
  const bar = Array.from({ length: total }, (_, i) => {
    if (i < filled) return "━";
    if (i === filled) return "╸";
    return "─";
  }).join("");

  const phaseLabel = phase === "llm" ? "LLM Setup" : "CL Account";

  return (
    <Box marginTop={1} flexDirection="column">
      <Box gap={1}>
        <Text dimColor>Step {current}/{total}</Text>
        <Text dimColor>·</Text>
        <Text color={phase === "llm" ? "cyan" : "yellow"}>{phaseLabel}</Text>
      </Box>
      <Box>
        <Text color="green">{bar.slice(0, filled)}</Text>
        <Text color="green" bold>{bar[filled] ?? ""}</Text>
        <Text dimColor>{bar.slice(filled + 1)}</Text>
      </Box>
    </Box>
  );
};

const WelcomeStep: React.FC<{ onContinue: () => void }> = ({ onContinue }) => {
  useInput((_input, key) => {
    if (key.return) onContinue();
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>Welcome! Let's configure your agent in two quick steps:</Text>
      <Box marginTop={1} flexDirection="column" paddingLeft={2}>
        <Box gap={1}>
          <Text color="cyan" bold>1.</Text>
          <Text>Connect an LLM provider</Text>
          <Text dimColor>(Anthropic, OpenAI, Google, ...)</Text>
        </Box>
        <Box gap={1}>
          <Text color="yellow" bold>2.</Text>
          <Text>Add a Commerce Layer account</Text>
          <Text dimColor>(endpoint + credentials)</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Config is saved to </Text>
        <Text color="gray">~/.config/cl-agent/config.json</Text>
        <Text dimColor> (permissions: 0600)</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green" bold>Press Enter to start →</Text>
      </Box>
    </Box>
  );
};

const ProviderStep: React.FC<{
  current: ProviderName;
  onSelect: (p: ProviderName) => void;
}> = ({ current, onSelect }) => (
  <Box flexDirection="column">
    <StepTitle title="Select LLM Provider" />
    <Text dimColor>Choose the AI provider for your agent. You can change this later with /settings.</Text>
    <Box marginTop={1}>
      <Select
        options={ALL_PROVIDERS.map((p) => ({
          label: `${PROVIDER_LABELS[p]}`,
          value: p,
        }))}
        defaultValue={current}
        onChange={(value) => onSelect(value as ProviderName)}
      />
    </Box>
  </Box>
);

const ApiKeyStep: React.FC<{
  provider: ProviderName;
  providerLabel: string;
  input: string;
  onChange: (v: string) => void;
  onSubmit: (key: string) => void;
}> = ({ provider, providerLabel, input, onChange, onSubmit }) => {
  const isVercel = provider === "vercel";
  const envHint = isVercel
    ? "You can also set AI_GATEWAY_API_KEY as an env var. Press Enter to skip."
    : null;

  return (
    <Box flexDirection="column">
      <StepTitle title={`API Key — ${providerLabel}`} />
      <Text dimColor>Paste your API key below. It will be stored locally and never shared.</Text>
      {envHint && <Text color="gray">{envHint}</Text>}
      <Box marginTop={1}>
        <Text color="cyan" bold>{"› "}</Text>
        <TextInput
          value={input}
          onChange={onChange}
          onSubmit={(v) => onSubmit(v.trim())}
          placeholder={isVercel ? "press Enter to use env var" : "sk-..."}
        />
      </Box>
    </Box>
  );
};

const ModelStep: React.FC<{
  provider: ProviderName;
  providerLabel: string;
  currentModel: string;
  onSelect: (model: string) => void;
}> = ({ provider, providerLabel, currentModel, onSelect }) => {
  const hints = MODEL_HINTS[provider] ?? [];
  const options = useMemo(() => [
    ...hints.map((m) => ({
      label: `${m}${m === currentModel ? "  (default)" : ""}`,
      value: m,
    })),
    { label: "Enter a custom model ID…", value: "__custom__" },
  ], [hints, currentModel]);

  return (
    <Box flexDirection="column">
      <StepTitle title={`Select Model — ${providerLabel}`} />
      <Text dimColor>Pick a model or enter a custom ID.</Text>
      <Box marginTop={1}>
        <Select
          options={options}
          defaultValue={currentModel}
          onChange={onSelect}
        />
      </Box>
    </Box>
  );
};

const CustomModelStep: React.FC<{
  provider: ProviderName;
  providerLabel: string;
  input: string;
  onChange: (v: string) => void;
  onSubmit: (model: string) => void;
  onBack: () => void;
}> = ({ providerLabel, input, onChange, onSubmit, onBack }) => {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  return (
    <Box flexDirection="column">
      <StepTitle title={`Custom Model — ${providerLabel}`} />
      <Text dimColor>Type any valid model ID. Press Esc to go back to the list.</Text>
      <Box marginTop={1}>
        <Text color="cyan" bold>{"› "}</Text>
        <TextInput
          value={input}
          onChange={onChange}
          onSubmit={(v) => {
            const model = v.trim();
            if (model) onSubmit(model);
          }}
          placeholder="e.g. claude-opus-4-20250514"
        />
      </Box>
    </Box>
  );
};

const AuthModeStep: React.FC<{
  onSelect: (mode: "client" | "token") => void;
}> = ({ onSelect }) => (
  <Box flexDirection="column">
    <StepTitle title="Authentication Method" />
    <Text dimColor>How should the agent authenticate with Commerce Layer?</Text>
    <Box marginTop={1}>
      <Select
        options={[
          {
            label: "OAuth Client Credentials (recommended)",
            value: "client",
          },
          {
            label: "Pre-generated Access Token",
            value: "token",
          },
        ]}
        onChange={(value) => onSelect(value as "client" | "token")}
      />
    </Box>
  </Box>
);

const TextStep: React.FC<{
  title: string;
  description?: string;
  hint?: string;
  placeholder?: string;
  input: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  required?: boolean;
}> = ({ title, description, hint, placeholder, input, onChange, onSubmit, required }) => (
  <Box flexDirection="column">
    <StepTitle title={title} />
    {description && <Text dimColor>{description}</Text>}
    {hint && <Text color="gray">{hint}</Text>}
    <Box marginTop={1}>
      <Text color="cyan" bold>{"› "}</Text>
      <TextInput
        value={input}
        onChange={onChange}
        onSubmit={(v) => {
          const val = v.trim();
          if (required && !val) return;
          onSubmit(val);
        }}
        placeholder={placeholder}
      />
    </Box>
  </Box>
);

const SectionDivider: React.FC<{ title: string }> = ({ title }) => (
  <Box marginBottom={1} flexDirection="column">
    <Box gap={1}>
      <Text color="yellow" bold>{"▸"}</Text>
      <Text color="yellow" bold>{title}</Text>
    </Box>
    <Text color="yellow" dimColor>{"─".repeat(40)}</Text>
  </Box>
);

const StepTitle: React.FC<{ title: string }> = ({ title }) => (
  <Box marginBottom={1}>
    <Text color="white" bold>{title}</Text>
  </Box>
);
