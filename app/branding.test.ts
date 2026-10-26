import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { conversationMarkdown } from "@/server/domain/message/conversation-sources";

test("root page metadata uses the ChatNest product title", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(
    layout,
    /export const metadata: Metadata = \{[^}]*title: "ChatNest"/s
  );
});

test("admin metadata overrides the root title with ChatNest Admin", () => {
  const layout = readFileSync("app/admin/layout.tsx", "utf8");
  assert.match(
    layout,
    /export const metadata: Metadata = \{[^}]*title: "ChatNest Admin"/s
  );
});

test("home button keeps its new-chat action with visible and accessible ChatNest branding", () => {
  const sidebar = readFileSync("app/_components/chat/app-sidebar.tsx", "utf8");
  assert.match(
    sidebar,
    /<button\s+aria-label="ChatNest 首页"[^>]*onClick=\{handleNew\}[^>]*>[\s\S]*?\sChatNest\s*<\/button>/
  );
});

test("conversation download uses a ChatNest filename and the existing Markdown exporter", () => {
  const sources = readFileSync(
    "app/_components/chat/conversation-sources.tsx",
    "utf8"
  );
  assert.ok(sources.includes("new Blob([conversationMarkdown(messages)]"));
  assert.ok(sources.includes('type: "text/markdown;charset=utf-8"'));
  assert.match(
    sources,
    /anchor\.download = `chatnest-\$\{chatId\.slice\(0, 8\)\}\.md`;/
  );
});

test("ChatNest conversation Markdown preserves message text and returned source links", () => {
  const markdown = conversationMarkdown([
    {
      id: "user",
      parts: [{ text: "Research 是用户原文，不要改写。", type: "text" }],
      role: "user",
    },
    {
      id: "assistant",
      parts: [
        { text: "可见回答", type: "text" },
        {
          sourceId: "fixture-source",
          title: "Research 原始来源",
          type: "source-url",
          url: "https://example.test/research",
        },
      ],
      role: "assistant",
    },
  ]);
  assert.ok(markdown.startsWith("# ChatNest 对话记录\n"));
  assert.ok(markdown.includes("## 用户\n\nResearch 是用户原文，不要改写。"));
  assert.ok(markdown.includes("## 助手\n\n可见回答"));
  assert.ok(
    markdown.includes(
      "[Research 原始来源](<https://example.test/research>) — 模型服务引用"
    )
  );
});
