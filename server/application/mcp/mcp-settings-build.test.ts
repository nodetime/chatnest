import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Next chat route exposes only supported route exports, keeping getStreamContext internal", () => {
  const source = readFileSync("app/(chat)/api/chat/route.ts", "utf8");
  assert.ok(!/export\s*\{[^}]*getStreamContext/s.test(source));
  assert.ok(!/export\s+(?:async\s+)?function\s+getStreamContext/.test(source));
  // P2:getStreamContext 下沉平台层 request.ts,仍不随路由/helper 导出
  const helper = readFileSync("app/(chat)/api/chat/request.ts", "utf8");
  assert.ok(!/export\s*\{[^}]*getStreamContext/s.test(helper));
  assert.ok(!/export\s+(?:async\s+)?function\s+getStreamContext/.test(helper));
  assert.match(helper, /function getStreamContext\(/);
});
