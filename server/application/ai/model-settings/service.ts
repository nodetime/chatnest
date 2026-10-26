import "server-only";
import {
  decryptSettings,
  encryptSettings,
  parseEncryptionKey,
} from "@/server/agent/mcp-settings/crypto";
import type { SettingsRepository } from "@/server/agent/mcp-settings/repository";
import {
  type Environment,
  SettingsError,
} from "@/server/agent/mcp-settings/security";
import {
  configurationSchema,
  editSchema,
  keySchema,
  type ModelSettingsProjection,
  type PrivateModelSettings,
} from "@/server/domain/model/settings-schema";
import { settingsRepository } from "@/server/infrastructure/persistence/drizzle/model-settings-repository";
import { getModelConnection } from "../model-connection";
import { validateModelURL } from "./network";
import { listRemoteModels, probeModel } from "./probe";

const domain = "model-settings";
export function createModelSettingsService({
  repository = settingsRepository,
  env = process.env,
  probe = probeModel,
}: {
  repository?: SettingsRepository;
  env?: Environment;
  probe?: typeof probeModel;
} = {}) {
  async function read() {
    if (!env.POSTGRES_URL) {
      return { revision: 0, settings: null };
    }
    const row = await repository.read();
    if (!row) {
      return { revision: 0, settings: null };
    }
    const value = decryptSettings(
      row.encrypted,
      row.revision,
      parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY),
      domain
    ) as PrivateModelSettings;
    const { apiKey, ...config } = value;
    return {
      revision: row.revision,
      settings: {
        ...configurationSchema.parse(config),
        apiKey: keySchema.parse(apiKey),
      },
    };
  }
  function legacy(): PrivateModelSettings {
    const connection = getModelConnection(env);
    return {
      apiKey: env.OPENAI_API_KEY?.trim() ?? "",
      apiMode: connection.apiMode,
      baseURL: connection.baseURL,
      defaultModel: connection.modelId,
      models: [
        {
          id: connection.modelId,
          tools: env.OPENAI_MODEL_TOOLS !== "0",
          vision: env.OPENAI_MODEL_VISION === "1",
        },
      ],
    };
  }
  async function resolve(input: unknown) {
    if (!env.POSTGRES_URL) {
      throw new SettingsError(503, "请先配置平台数据库。");
    }
    parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY);
    const edit = editSchema.parse(input),
      state = await read();
    if (edit.revision !== state.revision) {
      throw new SettingsError(409, "配置已更新，请刷新后重试；输入仍保留。");
    }
    validateModelURL(edit.config.baseURL, env);
    const previous = state.settings ?? legacy();
    if (
      edit.key.mode === "keep" &&
      (previous.baseURL !== edit.config.baseURL ||
        !previous.apiKey ||
        (!state.settings && getModelConnection(env).provider !== "openai"))
    ) {
      throw new SettingsError(
        400,
        "更换模型地址时请重新输入对应 Key，不复用其他服务凭据。"
      );
    }
    return {
      revision: state.revision,
      settings: {
        ...edit.config,
        apiKey: edit.key.mode === "replace" ? edit.key.value : previous.apiKey,
      },
    };
  }
  return {
    async get(): Promise<ModelSettingsProjection> {
      const state = await read(),
        settings = state.settings ?? legacy();
      const { apiKey, ...config } = settings;
      let manageable = false;
      try {
        parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY);
        manageable = !!env.POSTGRES_URL;
      } catch {
        /* Deployment bootstrap only. */
      }
      return {
        config,
        configured: state.settings
          ? !!apiKey
          : getModelConnection(env).configured,
        hasKey: !!apiKey,
        manageable,
        revision: state.revision,
        source: state.settings ? "managed" : "environment",
      };
    },
    load: async () => (await read()).settings,
    async models(input: unknown) {
      return listRemoteModels((await resolve(input)).settings, env);
    },
    async save(input: unknown, updatedBy: string) {
      const { revision, settings } = await resolve(input);
      if (
        !(await repository.compareAndSwap(revision, {
          encrypted: encryptSettings(
            settings,
            revision + 1,
            parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY),
            domain
          ),
          revision: revision + 1,
          updatedAt: new Date(),
          updatedBy,
        }))
      ) {
        throw new SettingsError(409, "配置已更新，请刷新后重试；输入仍保留。");
      }
      return { revision: revision + 1 };
    },
    async test(input: unknown) {
      return probe((await resolve(input)).settings, env);
    },
  };
}
