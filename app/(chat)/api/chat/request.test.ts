import assert from "node:assert/strict";
import { test } from "node:test";
import { SettingsError } from "@/server/application/mcp/security";
import { ChatbotError, type ErrorCode } from "@/server/shared/errors";
import { mapChatError } from "./request";

test("expired task scope uses the SDK error envelope and preserves its human message", async () => {
  const message = "能力配置已变化，旧审批已失效，请发送新消息确认当前能力。";
  const response = mapChatError(
    new SettingsError(409, message),
    new Request("http://localhost/api/chat")
  );
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "bad_request:capability");
  const error = new ChatbotError(body.code as ErrorCode, body.cause);
  assert.equal(error.message, message);
  assert.doesNotMatch(error.message, /endsWith|undefined/);
});
