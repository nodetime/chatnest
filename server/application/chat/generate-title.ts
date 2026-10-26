import { generateText, type UIMessage } from "ai";
import { getModelConnection } from "@/server/application/ai/model-connection";
import { titlePrompt } from "@/server/application/ai/prompts";
import { getTitleModel } from "@/server/application/ai/providers";
import { getTextFromMessage } from "@/server/domain/message/convert";
import { titleModel } from "@/server/domain/model/models";
import { metadataOnlyTelemetry } from "@/server/shared/telemetry";

// P2 从 app/(chat)/actions.ts 迁入:标题生成是应用层用例,平台层 actions 不再承载 AI 编排
export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text } = await generateText({
    instructions: titlePrompt,
    model: getTitleModel(),
    prompt: getTextFromMessage(message),
    providerOptions: {
      ...(getModelConnection().provider === "gateway" && {
        gateway: { order: titleModel.gatewayOrder },
      }),
    },
    telemetry: metadataOnlyTelemetry,
  });
  return text
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim();
}
