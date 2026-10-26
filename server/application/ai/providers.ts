import { createOpenAI } from "@ai-sdk/openai";
import { customProvider, gateway, wrapLanguageModel } from "ai";
import { titleModel } from "@/server/domain/model/models";
import { isTestEnvironment } from "@/server/shared/runtime";
import { openAIInlineImageMiddleware } from "./inline-image-middleware";
import { getModelConnection, resolveModelId } from "./model-connection";
import { getModelEnvironment } from "./model-context";
import { modelFetch } from "./model-settings/network";

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        titleModel: mockTitleModel,
      } = require("@/server/domain/model/models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": mockTitleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const connection = getModelConnection();
  if (connection.provider === "openai") {
    const provider = createOpenAI({
      apiKey: getModelEnvironment().OPENAI_API_KEY,
      ...(getModelEnvironment().OPENAI_MANAGED_CONNECTION === "1"
        ? { fetch: modelFetch(connection.baseURL, getModelEnvironment()) }
        : {}),
      baseURL: connection.baseURL,
    });
    return connection.apiMode === "responses"
      ? provider.responses(resolveModelId(modelId))
      : wrapLanguageModel({
          middleware: openAIInlineImageMiddleware,
          model: provider.chat(resolveModelId(modelId)),
        });
  }
  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return getLanguageModel(titleModel.id);
}
