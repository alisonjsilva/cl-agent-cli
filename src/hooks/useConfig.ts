import React, { createContext, useContext, useState, useCallback } from "react";
import { Config } from "../config/schema.js";
import { saveConfig } from "../config/store.js";

interface ConfigContextValue {
  cfg: Config;
  update: (next: Config) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export const ConfigProvider: React.FC<{
  initial: Config;
  children: React.ReactNode;
}> = ({ initial, children }) => {
  const [cfg, setCfg] = useState(initial);

  const update = useCallback(async (next: Config) => {
    await saveConfig(next);
    setCfg(next);
  }, []);

  return React.createElement(
    ConfigContext.Provider,
    { value: { cfg, update } },
    children,
  );
};

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within ConfigProvider");
  return ctx;
}
