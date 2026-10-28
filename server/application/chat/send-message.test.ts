import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { UIMessage } from "ai";
import type { ChatRepository } from "@/server/domain/chat/repository";
import type { Chat } from "@/server/domain/chat/types";
import type { MessageRepository } from "@/server/domain/message/repository";
import { ChatbotError } from "@/server/shared/errors";

// 用例单测(mock 仓储,不起 HTTP、不碰模型):只钉业务失败分支;
// 流式成功路径靠离线套件 + 浏览器验收兜底(待办文档 P2 约定)。

// 模型配置检查:离线环境设 OPENAI_API_KEY 使 configured=true 通过前置检查。
// 不用 PLAYWRIGHT 开关——同进程串行跑套件时会泄漏污染其他文件的 isTestEnvironment。
const savedApiKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = savedApiKey ?? "offline-unit-test-key";
after(() => {
  if (savedApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = savedApiKey;
  }
});

const chat = (userId: string): Chat => ({
  createdAt: new Date(),
  id: "c1",
  title: "t",
  userId,
  visibility: "private",
});

function makeDeps(overrides?: { chat?: Chat | null; messageCount?: number }) {
  const chats: ChatRepository = {
    createStreamId: async () => undefined,
    deleteAllByUserId: async () => ({ deletedCount: 0 }),
    deleteById: async () => null,
    findById: async () =>
      overrides?.chat === undefined ? null : overrides.chat,
    listByUser: async () => ({ chats: [], hasMore: false }),
    save: async () => null,
    updateTitle: async () => true,
    updateVisibility: async () => true,
  };
  const messages: MessageRepository = {
    countByUserSince: async () => overrides?.messageCount ?? 0,
    deleteByChatIdAfterTimestamp: async () => null,
    findById: async () => [],
    listByChatId: async () => [],
    mergeInteractionResponses: async () => ({ changed: false, messages: [] }),
    replaceEditedTurn: async () => null,
    replaceRegeneratedAnswer: async () => null,
    saveMany: async () => null,
    updateContinuationParts: async () => false,
    updateParts: async () => null,
  };
  return { chats, messages };
}

type Trigger = "submit-message" | "regenerate-message" | "edit-message";

async function run(
  trigger: Trigger,
  deps: ReturnType<typeof makeDeps>,
  message?: { id: string; role: string; parts: unknown[] }
) {
  const { sendMessage } = await import("./send-message");
  return sendMessage(
    {
      body: {
        id: "c1",
        ...(message ? { message } : {}),
        searchMode: "auto",
        selectedChatModel: "test-model",
        selectedVisibilityType: "private",
        trigger,
      },
      ip: undefined,
      requestHints: { city: "", country: "", latitude: "0", longitude: "0" },
      session: { expires: "", user: { id: "u1", type: "regular" } },
      signal: new AbortController().signal,
    },
    deps
  );
}

async function expectCode(
  promise: Promise<unknown>,
  code: string
): Promise<void> {
  await promise.then(
    () => assert.fail("应当抛出 ChatbotError"),
    (error: unknown) => {
      assert.ok(
        error instanceof ChatbotError,
        `应为 ChatbotError,实为 ${error}`
      );
      assert.equal((error as ChatbotError).type, code);
    }
  );
}

test("消息数超过配额时拒绝 rate_limit:chat", async () => {
  await expectCode(
    run("submit-message", makeDeps({ messageCount: 999 })),
    "rate_limit"
  );
});

test("非属主会话拒绝 forbidden:chat", async () => {
  await expectCode(
    run("submit-message", makeDeps({ chat: chat("u2") })),
    "forbidden"
  );
});

test("重新生成缺消息锚点时拒绝 bad_request:api", async () => {
  await expectCode(run("regenerate-message", makeDeps()), "bad_request");
});

test("会话不存在时重新生成拒绝 bad_request:api", async () => {
  await expectCode(
    run("regenerate-message", makeDeps({ chat: null })),
    "bad_request"
  );
});

test("编辑消息缺锚点时拒绝 bad_request:api", async () => {
  await expectCode(run("edit-message", makeDeps()), "bad_request");
});

test("部分 Ask 回答与幂等重交在真实 SDK 流中返回已存答案，不访问模型", async () => {
  const { sendMessage } = await import("./send-message");
  const { readUIMessageStream } = await import("ai");
  const input = {
    questions: [{ id: "goal", label: "目标", required: true, type: "text" }],
    title: "目标",
  };
  const output = { answers: { goal: "核对来源" }, status: "answered" };
  await Promise.all(
    [true, false].map(async (pendingApproval) => {
      const deps = makeDeps({ chat: chat("u1") });
      const parts: unknown[] = [
        {
          input,
          output,
          state: "output-available",
          toolCallId: "ask",
          type: "tool-askUser",
        },
      ];
      if (pendingApproval) {
        parts.push({
          approval: { id: "original-approval" },
          input: {},
          state: "approval-requested",
          toolCallId: "approval-call",
          toolName: "fixture__write",
          type: "dynamic-tool",
        });
      }
      const stored = [
        {
          attachments: [],
          chatId: "c1",
          createdAt: new Date(),
          id: "assistant",
          parts,
          role: "assistant",
        },
      ];
      deps.messages.listByChatId = async () => stored;
      let merged = 0;
      deps.messages.mergeInteractionResponses = () => {
        merged += 1;
        return Promise.resolve({ changed: pendingApproval, messages: stored });
      };
      deps.messages.updateParts = async () =>
        assert.fail("等待响应不应再次覆盖消息");
      const stream = await sendMessage(
        {
          body: {
            id: "c1",
            messages: [
              {
                id: "assistant",
                parts: [
                  {
                    output,
                    state: "output-available",
                    toolCallId: "ask",
                    type: "tool-askUser",
                  },
                ],
                role: "assistant",
              },
            ],
            searchMode: "auto",
            selectedChatModel: "test-model",
            selectedVisibilityType: "private",
            trigger: "submit-message",
          },
          requestHints: {
            city: "",
            country: "",
            latitude: "0",
            longitude: "0",
          },
          session: { expires: "", user: { id: "u1", type: "regular" } },
          signal: new AbortController().signal,
        },
        deps
      );
      let latest: UIMessage | undefined;
      for await (const item of readUIMessageStream({
        message: {
          id: "assistant",
          parts: [
            {
              input,
              state: "input-available",
              toolCallId: "ask",
              type: "tool-askUser",
            },
          ],
          role: "assistant",
        },
        stream,
      })) {
        latest = item;
      }
      assert.equal(merged, 1);
      assert.match(JSON.stringify(latest), /核对来源/);
      assert.equal(latest?.id, "assistant");
    })
  );
});

test("纯 MCP 审批重交必须先经持久化合并，不访问模型或重放外发", async () => {
  const { sendMessage } = await import("./send-message");
  const { readUIMessageStream } = await import("ai");
  const deps = makeDeps({ chat: chat("u1") });
  let merges = 0;
  const parts = [
    {
      approval: { approved: true, id: "approval" },
      input: {},
      state: "approval-responded",
      toolCallId: "call",
      toolName: "fixture__run",
      type: "dynamic-tool",
    },
  ];
  deps.messages.listByChatId = async () => [
    {
      attachments: [],
      chatId: "c1",
      createdAt: new Date(),
      id: "assistant",
      parts,
      role: "assistant",
    },
  ];
  deps.messages.mergeInteractionResponses = async () => {
    merges += 1;
    return { changed: false, messages: await deps.messages.listByChatId("c1") };
  };
  const stream = await sendMessage(
    {
      body: {
        id: "c1",
        messages: [{ id: "assistant", parts, role: "assistant" }],
        searchMode: "auto",
        selectedChatModel: "test-model",
        selectedVisibilityType: "private",
        trigger: "submit-message",
      },
      requestHints: { city: "", country: "", latitude: "0", longitude: "0" },
      session: { expires: "", user: { id: "u1", type: "regular" } },
      signal: new AbortController().signal,
    },
    deps
  );
  assert.equal(merges, 1);
  for await (const _message of readUIMessageStream({ stream })) {
    /* 实际消费空续跑流。 */
  }
});
