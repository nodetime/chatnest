import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, generateText, wrapLanguageModel } from "ai";
import sharp from "sharp";

test("installed OpenAI chat converter sends original PNG and JPEG bytes as complete data URLs on the wire", async () => {
  const { openAIInlineImageMiddleware } = await import(
    "@/lib/ai/inline-image-middleware"
  );
  const png = await sharp({
    create: { background: "#ffaa00", channels: 3, height: 1, width: 1 },
  })
    .png()
    .toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer();
  for (const [mime, bytes] of [
    ["image/png", png],
    ["image/jpeg", jpeg],
  ] as const) {
    let captured: Record<string, unknown> | undefined;
    const provider = createOpenAI({
      apiKey: "FIXTURE_OFFLINE_KEY",
      baseURL: "http://fixture.invalid/v1",
      // biome-ignore lint/suspicious/useAwait: The injected asynchronous API deliberately resolves without real I/O in this offline test.
      fetch: async (_url, init) => {
        captured = JSON.parse(String(init?.body));
        // biome-ignore lint/suspicious/useStaticResponseMethods: Capture the exact provider JSON response shape in this injected fetch fixture.
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                index: 0,
                message: { content: "fixture ok", role: "assistant" },
              },
            ],
            created: 0,
            id: "fixture",
            model: "fixture",
            object: "chat.completion",
            usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
          }),
          { headers: { "content-type": "application/json" } }
        );
      },
    });
    // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential I/O prevents concurrent memory and transaction pressure.
    const messages = await convertToModelMessages([
      {
        parts: [
          {
            mediaType: mime,
            type: "file",
            url: `data:${mime};base64,${bytes.toString("base64")}`,
          },
        ],
        role: "user",
      },
    ]);
    const result = await generateText({
      messages,
      model: wrapLanguageModel({
        middleware: openAIInlineImageMiddleware,
        model: provider.chat("fixture"),
      }),
    });
    assert.equal(result.text, "fixture ok");
    const wire = (
      captured?.messages as {
        content: { type: string; image_url?: { url: string } }[];
      }[]
    )[0].content.find((part) => part.type === "image_url")?.image_url?.url;
    assert.equal(wire, `data:${mime};base64,${bytes.toString("base64")}`);
  }
});
