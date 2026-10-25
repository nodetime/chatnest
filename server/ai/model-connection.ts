// Server consumers only. Never return credentials in API metadata.

import { getModelEnvironment } from "./model-context";
import {
  type ChatModel,
  chatModels,
  DEFAULT_CHAT_MODEL,
  type ModelCapabilities,
} from "./models";

type Environment = Record<string, string | undefined>;

export function getModelConnection(env: Environment = getModelEnvironment()) {
  const provider =
    env.MODEL_PROVIDER ??
    (env.OPENAI_API_KEY || env.OPENAI_BASE_URL || env.OPENAI_MODEL
      ? "openai"
      : "gateway");
  if (provider !== "openai" && provider !== "gateway") {
    throw new Error("MODEL_PROVIDER must be openai or gateway");
  }
  const baseURL = (
    env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const apiMode = env.OPENAI_API_MODE || "chat";
  if (provider === "openai") {
    let parsed: URL;
    try {
      parsed = new URL(baseURL);
    } catch {
      // biome-ignore lint/style/useErrorCause: URL parse errors can contain credentials; report only the field name.
      throw new Error("OPENAI_BASE_URL must be an HTTP(S) API base URL");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      /\/(chat\/completions|responses)$/.test(parsed.pathname)
    ) {
      throw new Error(
        "OPENAI_BASE_URL must be the API base URL, without credentials or endpoint suffix"
      );
    }
    if (apiMode !== "chat" && apiMode !== "responses") {
      throw new Error("OPENAI_API_MODE must be chat or responses");
    }
  }
  return {
    apiMode: apiMode as "chat" | "responses",
    baseURL,
    configured:
      provider === "openai"
        ? Boolean(env.OPENAI_API_KEY?.trim())
        : Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN),
    modelId: env.OPENAI_MODEL?.trim() || "gpt-4.1",
    provider,
  };
}

function directModels(env: Environment) {
  const { modelId } = getModelConnection(env);
  return env.OPENAI_MANAGED_MODELS
    ? (JSON.parse(env.OPENAI_MANAGED_MODELS) as {
        id: string;
        tools: boolean;
        vision: boolean;
      }[])
    : [
        {
          id: modelId,
          tools: env.OPENAI_MODEL_TOOLS !== "0",
          vision: env.OPENAI_MODEL_VISION === "1",
        },
      ];
}
export function getRuntimeModels(
  env: Environment = getModelEnvironment()
): ChatModel[] {
  return getModelConnection(env).provider === "gateway"
    ? chatModels
    : directModels(env).map(({ id }) => ({
        description: "平台配置的 OpenAI / 兼容接口模型",
        id,
        name: id,
        provider: "openai",
      }));
}

export function resolveModelId(
  selected: string,
  env: Environment = getModelEnvironment()
) {
  const models = getRuntimeModels(env);
  return models.some((model) => model.id === selected)
    ? selected
    : getModelConnection(env).provider === "openai"
      ? getModelConnection(env).modelId
      : DEFAULT_CHAT_MODEL;
}

export function getDirectCapabilities(
  env: Environment = getModelEnvironment()
): Record<string, ModelCapabilities> {
  return Object.fromEntries(
    directModels(env).map(({ id, tools, vision }) => [
      id,
      { reasoning: false, tools, vision },
    ])
  );
}
