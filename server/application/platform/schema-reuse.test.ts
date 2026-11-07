import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("platform client uses only the generated wire schemas", () => {
  const source = readFileSync("server/application/platform/client.ts", "utf8");
  assert.match(source, /from "\.\/generated\/schemas"/);
  assert.doesNotMatch(source, /from "\.\/schemas"/);
  assert.doesNotMatch(source, /z\.(object|array|enum|number|string|boolean)\(/);
  assert.doesNotMatch(source, /const planSchema =/);
  assert.doesNotMatch(source, /const organizationSchema =/);
});
