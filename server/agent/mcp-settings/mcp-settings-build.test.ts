import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Next chat route exposes only supported route exports, keeping getStreamContext internal", () => {
  const source = readFileSync("app/(chat)/api/chat/route.ts", "utf8");
  assert.ok(!/export\s*\{[^}]*getStreamContext/s.test(source));
  assert.ok(!/export\s+(?:async\s+)?function\s+getStreamContext/.test(source));
  assert.match(source, /function getStreamContext\(/);
});
