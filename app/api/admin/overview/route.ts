import { auth } from "@/app/(auth)/auth";
import { readAgentConfig } from "@/server/agent/config";
import { createSettingsService } from "@/server/agent/mcp-settings/service";
import {
  createOverviewHandler,
  summarizeTools,
} from "@/server/application/admin/overview";
import {
  getModelConnection,
  getRuntimeModels,
} from "@/server/application/ai/model-connection";
import { withModelSettings } from "@/server/application/ai/model-settings/runtime";
import { DEFAULT_CHAT_MODEL } from "@/server/domain/model/models";
import { storageStatus } from "@/server/uploads/service";

export const GET = createOverviewHandler({
  model: () =>
    withModelSettings(() => {
      const connection = getModelConnection();
      const models = getRuntimeModels();
      const model =
        connection.provider === "openai"
          ? models.find((candidate) => candidate.id === connection.modelId)
          : models.find((candidate) => candidate.id === DEFAULT_CHAT_MODEL);
      return {
        configured: connection.configured,
        name: model?.name ?? DEFAULT_CHAT_MODEL,
        provider: connection.provider,
      };
    }),
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
