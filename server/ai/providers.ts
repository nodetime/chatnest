import { createOpenAI } from "@ai-sdk/openai";
import { customProvider, gateway, wrapLanguageModel } from "ai";
import { isTestEnvironment } from "@/app/_lib/constants";
import { openAIInlineImageMiddleware } from "./inline-image-middleware";
import { getModelConnection } from "./model-connection";
import { titleModel } from "./models";

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        titleModel: mockTitleModel,
      } = require("./models.mock");
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
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: connection.baseURL,
    });
    return connection.apiMode === "responses"
      ? provider.responses(connection.modelId)
      : wrapLanguageModel({
          middleware: openAIInlineImageMiddleware,
          model: provider.chat(connection.modelId),
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
