import assert from "node:assert/strict";
import { test } from "node:test";
import { type Chat, canAccessChat } from "./types";

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
