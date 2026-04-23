import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGateway } from "@ai-sdk/gateway";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Config, ProviderName } from "../config/schema.js";

export function createModel(
  provider: ProviderName,
  modelId: string,
  apiKey?: string,
  baseURL?: string,
): LanguageModel {
  switch (provider) {
    case "anthropic": {
      const p = createAnthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
      return p(modelId);
    }
    case "openai": {
      const p = createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
      return p.chat(modelId);
    }
    case "google": {
      const p = createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
      return p(modelId);
    }
    case "openrouter": {
      const p = createOpenRouter({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
      });
      return p.chat(modelId);
    }
    case "vercel": {
      const gw = createGateway({
        apiKey: apiKey || process.env.AI_GATEWAY_API_KEY,
        ...(baseURL ? { baseURL } : {}),
      });
      return gw(modelId);
    }
  }
}

export function makeModel(cfg: Config): LanguageModel {
  const p = cfg.provider;
  const pc = cfg.providers[p];
  const key = pc?.apiKey;

  if (p !== "vercel" && !key) {
    throw new Error(
      `No API key configured for provider "${p}". Use /provider to configure or edit ~/.config/cl-agent/config.json`,
    );
  }

  return createModel(p, cfg.model, key, pc?.baseURL);
}
