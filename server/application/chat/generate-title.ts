import { generateText, type UIMessage } from "ai";
import { getModelConnection } from "@/server/ai/model-connection";
import { titleModel } from "@/server/ai/models";
import { titlePrompt } from "@/server/ai/prompts";
import { getTitleModel } from "@/server/ai/providers";
import { metadataOnlyTelemetry } from "@/server/ai/telemetry";
import { getTextFromMessage } from "@/server/domain/message/convert";

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
