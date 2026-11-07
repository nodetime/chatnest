import assert from "node:assert/strict";
import { test } from "node:test";
import { type Chat, canAccessChat, normalizeChatTitle } from "./types";

// 访问规则与会话缺失语义:缺会话 = 不可访问(与平台层原判定一致)
const chat = (userId: string): Chat => ({
  createdAt: new Date(),
  id: "c1",
  title: "t",
  userId,
  visibility: "private",
});

test("属主匹配时可访问", () => {
  assert.equal(canAccessChat(chat("u1"), "u1"), true);
});

test("属主不匹配时不可访问", () => {
  assert.equal(canAccessChat(chat("u2"), "u1"), false);
});

test("会话缺失时不可访问", () => {
  assert.equal(canAccessChat(null, "u1"), false);
});

test("模型空标题保留用户内容，纯图片会话也有可见标题", () => {
  assert.equal(normalizeChatTitle(" \n", "  找相似\n商品  "), "找相似 商品");
  assert.equal(normalizeChatTitle(' # " " ', "参考图"), "参考图");
  assert.equal(normalizeChatTitle("", ""), "新对话");
  assert.equal(normalizeChatTitle("", "长".repeat(100)).length, 60);
  assert.equal(
    normalizeChatTitle('# "蘑菇台灯比较"', "原始提问"),
    "蘑菇台灯比较"
  );
});
