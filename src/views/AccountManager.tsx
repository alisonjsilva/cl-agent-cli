import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Select } from "@inkjs/ui";
import { useConfig } from "../hooks/useConfig.js";
import { normalizeEndpoint, detectEnvironment } from "../config/accounts.js";
import { EnvBadge } from "../components/EnvBadge.js";

interface AccountManagerProps {
  onBack: () => void;
}

type AccountStep = "list" | "add_name" | "add_endpoint" | "add_auth" | "add_clientId" | "add_clientSecret" | "add_token" | "add_scope";

export const AccountManager: React.FC<AccountManagerProps> = ({ onBack }) => {
  const { cfg, update } = useConfig();
  const [step, setStep] = useState<AccountStep>("list");
  const [input, setInput] = useState("");
  const [newName, setNewName] = useState("");
  const [newEndpoint, setNewEndpoint] = useState("");
  const [newAuth, setNewAuth] = useState<"client" | "token">("client");
  const [newClientId, setNewClientId] = useState("");
  const [newClientSecret, setNewClientSecret] = useState("");
  const [newToken, setNewToken] = useState("");

  useInput((_input, key) => {
    if (key.escape) {
      if (step === "list") onBack();
      else setStep("list");
    }
  });

  const names = Object.keys(cfg.accounts);

  const handleAddSubmit = async (value: string) => {
    const v = value.trim();
    setInput("");
    switch (step) {
      case "add_name":
        setNewName(v || "default");
        setStep("add_endpoint");
        break;
      case "add_endpoint":
        setNewEndpoint(v);
        setStep("add_auth");
        break;
      case "add_clientId":
        setNewClientId(v);
        setStep("add_clientSecret");
        break;
      case "add_clientSecret":
        setNewClientSecret(v);
        setStep("add_scope");
        break;
      case "add_token":
        setNewToken(v);
        setStep("add_scope");
        break;
      case "add_scope": {
        const name = newName || "default";
        await update({
          ...cfg,
          activeAccount: name,
          accounts: {
            ...cfg.accounts,
            [name]: {
              baseEndpoint: normalizeEndpoint(newEndpoint),
              clientId: newAuth === "client" ? newClientId : undefined,
              clientSecret: newAuth === "client" && newClientSecret ? newClientSecret : undefined,
              accessToken: newAuth === "token" ? newToken : undefined,
              scope: v || undefined,
            },
          },
        });
        setStep("list");
        break;
      }
    }
  };

  if (step === "add_auth") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>Add Account</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          <Text><Text color="cyan" bold>? </Text>Authentication mode</Text>
          <Text color="gray">  How should the agent authenticate with Commerce Layer?</Text>
          <Box marginTop={1}>
            <Select
              options={[
                { label: "OAuth Client Credentials (recommended)", value: "client" },
                { label: "Pre-generated Access Token", value: "token" },
              ]}
              onChange={(value) => {
                const mode = value as "client" | "token";
                setNewAuth(mode);
                setStep(mode === "token" ? "add_token" : "add_clientId");
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (step !== "list") {
    const labels: Record<string, { label: string; hint?: string }> = {
      add_name: { label: "Account name?", hint: "e.g. prod, staging, sandbox" },
      add_endpoint: { label: "CL base endpoint?", hint: "e.g. yourdomain or yourdomain.commercelayer.io" },
      add_clientId: { label: "Client ID?" },
      add_clientSecret: { label: "Client Secret?", hint: "leave blank for public client" },
      add_token: { label: "Access Token?" },
      add_scope: { label: "Scope? (optional)", hint: "e.g. market:id:xYZkjABcde" },
    };
    const info = labels[step] ?? { label: step };
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>Add Account</Text>
        <Text dimColor>Esc to cancel</Text>
        <Box marginTop={1} flexDirection="column">
          <Text><Text color="cyan" bold>? </Text>{info.label}</Text>
          {info.hint && <Text color="gray">  {info.hint}</Text>}
          <Box>
            <Text color="cyan">{"› "}</Text>
            <TextInput value={input} onChange={setInput} onSubmit={handleAddSubmit} />
          </Box>
        </Box>
      </Box>
    );
  }

  const options = [
    ...names.map((n) => ({
      label: `${n === cfg.activeAccount ? "* " : "  "}${n} (${cfg.accounts[n].baseEndpoint})`,
      value: `use:${n}`,
    })),
    { label: "+ Add new account", value: "add" },
    ...(names.length > 0
      ? [{ label: "- Remove an account…", value: "remove" }]
      : []),
    { label: "Back to chat", value: "back" },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box gap={1}>
        <Text color="green" bold>Commerce Layer Accounts</Text>
        {cfg.activeAccount && cfg.accounts[cfg.activeAccount] && (
          <EnvBadge env={detectEnvironment(cfg.accounts[cfg.activeAccount])} />
        )}
      </Box>
      <Text dimColor>
        Active: {cfg.activeAccount ?? "none"} | Esc to go back
      </Text>
      <Box marginTop={1}>
        <Select
          options={options}
          onChange={async (value) => {
            if (value === "back") {
              onBack();
            } else if (value === "add") {
              setStep("add_name");
            } else if (value === "remove") {
              // For now, a simplified remove of the first non-active account
              const removable = names.filter((n) => n !== cfg.activeAccount);
              if (removable.length > 0) {
                const toRemove = removable[0];
                const { [toRemove]: _, ...remaining } = cfg.accounts;
                await update({ ...cfg, accounts: remaining });
              }
            } else if (value.startsWith("use:")) {
              const name = value.slice(4);
              await update({ ...cfg, activeAccount: name });
            }
          }}
        />
      </Box>
    </Box>
  );
};
