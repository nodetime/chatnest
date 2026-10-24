import { auth } from "@/app/(auth)/auth";
import { createOverviewHandler, summarizeTools } from "@/lib/admin/overview";
import { storageStatus } from "@/lib/uploads/service";
import { readAgentConfig } from "@/server/agent/config";
import { createSettingsService } from "@/server/agent/mcp-settings/service";
import {
  getModelConnection,
  getRuntimeModels,
} from "@/server/ai/model-connection";
import { DEFAULT_CHAT_MODEL } from "@/server/ai/models";

export const GET = createOverviewHandler({
  // biome-ignore lint/suspicious/useAwait: Match the isolated async readiness-reader contract; this service is synchronous and performs no model calls.
  model: async () => {
    const connection = getModelConnection();
    const models = getRuntimeModels();
    const model =
      connection.provider === "openai"
        ? models[0]
        : models.find((candidate) => candidate.id === DEFAULT_CHAT_MODEL);
    return {
      configured: connection.configured,
      name: model?.name ?? DEFAULT_CHAT_MODEL,
      provider: connection.provider,
    };
  },
  session: async () => (await auth())?.user,
  storage: async () => {
    const status = await storageStatus();
    return { configured: status.configured, enabled: status.enabled };
  },
  tools: async () => {
    const file = (await readAgentConfig()).servers;
    const settings = await createSettingsService().get(file);
    return summarizeTools(file, settings);
  },
});
