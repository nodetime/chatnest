import type { LanguageModelV4Middleware } from "@ai-sdk/provider";
// @ai-sdk/openai 4.0.7 chat serialization emits bare base64 for v4 image data.
// Normalize ONLY verified inline JPEG/PNG to URL-tagged data URLs after SDK
// prompt normalization, before the provider converter. No network/byte changes.
// Keep the real provider-wire regression when upgrading/removing this shim.
export const openAIInlineImageMiddleware: LanguageModelV4Middleware = {
  specificationVersion: "v4",
  transformParams: async ({ params }) => ({
    ...params,
    prompt: params.prompt.map((message) => {
      if (message.role !== "user" && message.role !== "assistant") {
        return message;
      }
      return {
        ...message,
        content: message.content.map((part) => {
          if (
            part.type !== "file" ||
            part.data.type !== "data" ||
            !["image/png", "image/jpeg"].includes(part.mediaType)
          ) {
            return part;
          }
          const bytes = part.data.data;
          const base64 =
            typeof bytes === "string"
              ? bytes
              : Buffer.from(bytes).toString("base64");
          return {
            ...part,
            data: {
              type: "url" as const,
              url: new URL(`data:${part.mediaType};base64,${base64}`),
            },
          };
        }),
      } as typeof message;
    }),
  }),
};
