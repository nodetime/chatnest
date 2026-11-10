import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, generateText, wrapLanguageModel } from "ai";
import sharp from "sharp";
import { openAIInlineImageMiddleware } from "@/server/application/ai/inline-image-middleware";
import { ResultEvidenceLedger } from "@/server/domain/message/result-evidence";
import {
  imageDNSAddresses,
  validateImageDestination,
} from "@/server/infrastructure/uploads/remote-image";
import { createImageViewer } from "./view-image";

const source = {
  completedAt: "2026-11-06T12:00:00.000Z",
  serverId: "fixture",
  serverName: "Fixture",
  timeBasis: "tool-completed" as const,
  toolCallId: "actual-source",
  toolName: "fixture__search",
};

test("viewing a candidate outside the sampled rows returns its own original source fields", async () => {
  const ledger = new ResultEvidenceLedger();
  const candidate = {
    description: "unrelated long source text ".repeat(60),
    detailUrl: "https://example.com/offer/4?variant=button",
    imageUrl: "https://example.com/fourth.jpg",
    itemId: 4,
    skuTitle: "Plug-in button variant",
    title: "Fourth candidate",
  };
  ledger.record(source, {
    structuredContent: {
      items: [
        { itemId: 1, title: "First candidate" },
        { itemId: 2, title: "Second candidate" },
        { itemId: 3, title: "Third candidate" },
        candidate,
      ],
    },
  });
  assert.ok(
    !ledger.projection(source.toolCallId)?.includes(candidate.detailUrl)
  );
  const fetched: string[] = [];
  const viewer = createImageViewer(
    ledger,
    new AbortController().signal,
    (url) => {
      fetched.push(url);
      return Promise.resolve({
        data: "fixture-pixels",
        height: 2,
        mediaType: "image/jpeg",
        width: 2,
      });
    }
  );
  assert.ok(viewer.tool.execute);
  const output = await viewer.tool.execute(
    { imagePath: "/items/3/imageUrl", sourceToolCallId: source.toolCallId },
    { context: {}, messages: [], toolCallId: "view-fourth" }
  );
  assert.ok("sourceRecord" in output && output.sourceRecord);
  assert.deepEqual(output.sourceRecord, {
    fields: {
      detailUrl: candidate.detailUrl,
      imageUrl: candidate.imageUrl,
      itemId: candidate.itemId,
      skuTitle: candidate.skuTitle,
      title: candidate.title,
    },
    partial: true,
    path: "/items/3",
  });
  assert.ok(Buffer.byteLength(JSON.stringify(output.sourceRecord)) <= 8000);
  assert.deepEqual(fetched, [candidate.imageUrl]);
});

test("candidate pixels reach actual provider wire while history keeps metadata only", async () => {
  const pixels = await sharp({
    create: { background: "#ffc800", channels: 3, height: 2, width: 2 },
  })
    .jpeg()
    .toBuffer();
  const ledger = new ResultEvidenceLedger();
  ledger.record(source, {
    structuredContent: {
      items: [{ image: "https://example.com/product.jpg" }],
    },
  });
  const fetched: string[] = [];
  const viewer = createImageViewer(
    ledger,
    new AbortController().signal,
    (url) => {
      fetched.push(url);
      return Promise.resolve({
        data: pixels.toString("base64"),
        height: 2,
        mediaType: "image/jpeg",
        width: 2,
      });
    }
  );
  const { tool } = viewer;
  assert.ok(tool.execute);
  const input = {
    imagePath: "/items/0/image",
    sourceToolCallId: source.toolCallId,
  };
  const options = { context: {}, messages: [], toolCallId: "view-1" };
  const output = await tool.execute(input, options);
  assert.ok("status" in output);
  assert.equal(output.status, "viewed");
  assert.doesNotMatch(JSON.stringify(output), /base64/);
  const history = [
    {
      parts: [
        {
          input,
          output,
          state: "output-available" as const,
          toolCallId: options.toolCallId,
          type: "tool-viewImage" as const,
        },
      ],
      role: "assistant" as const,
    },
  ];
  const converted = await convertToModelMessages(history, {
    tools: { viewImage: tool },
  });
  const projected = viewer.projectMessages(converted);
  assert.deepEqual(viewer.projectMessages(projected), projected);
  let captured:
    | {
        messages: {
          role: string;
          content: string | { type: string; image_url?: { url: string } }[];
        }[];
      }
    | undefined;
  const provider = createOpenAI({
    apiKey: "OFFLINE_FIXTURE",
    baseURL: "http://fixture.invalid/v1",
    fetch: (_url, init) => {
      captured = JSON.parse(String(init?.body));
      return Promise.resolve(
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              index: 0,
              message: { content: "ok", role: "assistant" },
            },
          ],
          created: 0,
          id: "fixture",
          model: "fixture",
          object: "chat.completion",
          usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
        })
      );
    },
  });
  await generateText({
    messages: projected,
    model: wrapLanguageModel({
      middleware: openAIInlineImageMiddleware,
      model: provider.chat("fixture"),
    }),
  });
  const image = captured?.messages
    .flatMap((message) =>
      Array.isArray(message.content) ? message.content : []
    )
    .find((part) => part.type === "image_url");
  assert.equal(
    image?.image_url?.url,
    `data:image/jpeg;base64,${pixels.toString("base64")}`
  );
  assert.ok(
    captured?.messages
      .filter((message) => message.role === "tool")
      .every(
        (message) =>
          !String(message.content).includes(pixels.toString("base64"))
      )
  );
  const reopened = createImageViewer(ledger, new AbortController().signal);
  const historical = await convertToModelMessages(history, {
    tools: { viewImage: reopened.tool },
  });
  assert.equal(reopened.projectMessages(historical).length, historical.length);
  const result = historical.find((message) => message.role === "tool");
  assert.ok(result && result.role === "tool");
  const [toolResult] = result.content;
  assert.ok(
    toolResult.type === "tool-result" && toolResult.output.type === "text"
  );
  assert.equal(JSON.parse(toolResult.output.value).pixelsAvailable, false);
  const absent = await tool.execute(
    { ...input, sourceToolCallId: "other-chat" },
    options
  );
  assert.ok("status" in absent);
  assert.equal(absent.status, "failed");
  assert.ok(!("sourceRecord" in absent));
  assert.deepEqual(fetched, ["https://example.com/product.jpg"]);
});

test("parallel candidate images carry their own source labels and pixels to the provider", async () => {
  const candidates = [
    { imageUrl: "https://example.com/pink.jpg", itemId: "same", skuId: "pink" },
    { imageUrl: "https://example.com/blue.jpg", itemId: "same", skuId: "blue" },
  ];
  const pixels = await Promise.all(
    ["#ff0080", "#0080ff"].map((background) =>
      sharp({ create: { background, channels: 3, height: 2, width: 2 } })
        .jpeg()
        .toBuffer()
    )
  );
  const ledger = new ResultEvidenceLedger();
  ledger.record(source, { structuredContent: candidates });
  const pending = new Map<string, (data: string) => void>();
  const viewer = createImageViewer(
    ledger,
    new AbortController().signal,
    (url) =>
      new Promise((resolve) => {
        pending.set(url, (data) =>
          resolve({ data, height: 2, mediaType: "image/jpeg", width: 2 })
        );
      })
  );
  const { execute } = viewer.tool;
  assert.ok(execute);
  const inputs = candidates.map((_, index) => ({
    imagePath: `/${index}/imageUrl`,
    sourceToolCallId: source.toolCallId,
  }));
  const reads = inputs.map((input, index) =>
    execute(input, { context: {}, messages: [], toolCallId: `view-${index}` })
  );
  pending.get(candidates[1].imageUrl)?.(pixels[1].toString("base64"));
  pending.get(candidates[0].imageUrl)?.(pixels[0].toString("base64"));
  const outputs = await Promise.all(reads);
  const history = [
    {
      parts: outputs.map((output, index) => ({
        input: inputs[index],
        output,
        state: "output-available" as const,
        toolCallId: `view-${index}`,
        type: "tool-viewImage" as const,
      })),
      role: "assistant" as const,
    },
  ];
  const converted = await convertToModelMessages(history, {
    tools: { viewImage: viewer.tool },
  });
  const projected = viewer.projectMessages(converted);
  assert.deepEqual(viewer.projectMessages(projected), projected);
  let wire: { messages: { role: string; content: unknown }[] } | undefined;
  const provider = createOpenAI({
    apiKey: "OFFLINE_FIXTURE",
    baseURL: "http://fixture.invalid/v1",
    fetch: (_url, init) => {
      wire = JSON.parse(String(init?.body));
      return Promise.resolve(
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              index: 0,
              message: { content: "ok", role: "assistant" },
            },
          ],
          created: 0,
          id: "fixture",
          model: "fixture",
          object: "chat.completion",
        })
      );
    },
  });
  await generateText({
    messages: projected,
    model: wrapLanguageModel({
      middleware: openAIInlineImageMiddleware,
      model: provider.chat("fixture"),
    }),
  });
  const images = wire?.messages.filter((message) => message.role === "user");
  assert.equal(images?.length, candidates.length);
  for (const [index, candidate] of candidates.entries()) {
    const content: unknown = images?.[index].content;
    assert.ok(Array.isArray(content));
    assert.equal(content.length, 2);
    assert.equal(content[0].type, "text");
    assert.ok(content[0].text.includes(`view-${index}`));
    assert.ok(
      content[0].text.includes(JSON.stringify(inputs[index].imagePath))
    );
    assert.ok(content[0].text.includes(JSON.stringify(source.toolCallId)));
    assert.ok(content[0].text.includes(JSON.stringify(candidate)));
    assert.deepEqual(content[1], {
      image_url: {
        url: `data:image/jpeg;base64,${pixels[index].toString("base64")}`,
      },
      type: "image_url",
    });
  }
});

test("failed image reads return neither source context nor a visual success", async () => {
  const ledger = new ResultEvidenceLedger();
  ledger.record(source, {
    structuredContent: [
      {
        detailUrl: "https://example.com/offer/1",
        image: "https://example.com/broken.jpg",
      },
    ],
  });
  const viewer = createImageViewer(ledger, new AbortController().signal, () => {
    throw new Error("Image unavailable");
  });
  assert.ok(viewer.tool.execute);
  const output = await viewer.tool.execute(
    { imagePath: "/0/image", sourceToolCallId: source.toolCallId },
    { context: {}, messages: [], toolCallId: "failed-view" }
  );
  assert.ok("status" in output);
  assert.equal(output.status, "failed");
  assert.ok(!("sourceRecord" in output));
});

test("image destinations reject private/mixed DNS, redirects protocol and credentials", () => {
  for (const [url, ips] of [
    ["http://example.com/img", ["1.1.1.1"]],
    ["https://localhost/img", ["127.0.0.1"]],
    ["https://example.com/img", ["1.1.1.1", "10.0.0.1"]],
    ["https://example.com/img", []],
    ["https://user:pass@example.com/img", ["1.1.1.1"]],
    ["https://example.com/img", ["::ffff:127.0.0.1"]],
  ] as [string, string[]][]) {
    assert.throws(() => validateImageDestination(url, ips));
  }
  assert.equal(
    validateImageDestination("https://example.com/img", ["1.1.1.1"]).hostname,
    "example.com"
  );
});

test("explicit image DNS pins retain exact hostname and public-address restrictions", () => {
  assert.equal(
    imageDNSAddresses(
      "other.example.com",
      '{"images.example.com":["1.1.1.1"]}'
    ),
    null
  );
  assert.deepEqual(
    imageDNSAddresses(
      "images.example.com",
      '{"images.example.com":["1.1.1.1"]}'
    ),
    [{ address: "1.1.1.1" }]
  );
  for (const raw of [
    "{}x",
    "[]",
    '{"images.example.com":["127.0.0.1"]}',
    '{"*.example.com":["1.1.1.1"]}',
    '{"images.example.com":[]}',
  ]) {
    assert.throws(() => imageDNSAddresses("images.example.com", raw));
  }
});
