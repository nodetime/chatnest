// biome-ignore-all lint/suspicious/useAwait: Deterministic offline fakes implement asynchronous production contracts.
// biome-ignore-all lint/style/noNonNullAssertion: Assertions establish fixture values before use.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectionFingerprint,
  parseHeaderInput,
  refreshConflictMessage,
} from "../../lib/agent/mcp-settings/editor";

test("editor verification is only valid for the exact current opaque/replace connection; explicit empty headers clears", () => {
  const a = connectionFingerprint("x", { mode: "keep" });
  const b = connectionFingerprint("x", {
    mode: "replace",
    value: { headers: {}, url: "https://fixture.example" },
  });
  assert.notEqual(a, b);
  assert.notEqual(
    b,
    connectionFingerprint("x", {
      mode: "replace",
      value: { headers: {}, url: "https://fixture.example/other" },
    })
  );
  assert.deepEqual(parseHeaderInput("{}"), {});
  assert.throws(() => parseHeaderInput('{"Host":"evil"}'));
  assert.throws(() => parseHeaderInput('{"Authorization":true}'));
});
test("keep verification is tied to the exact revision captured before discovery, replacement identity stays explicit", () => {
  assert.notEqual(
    connectionFingerprint("x", { mode: "keep" }, 1),
    connectionFingerprint("x", { mode: "keep" }, 2)
  );
  const replacement = {
    mode: "replace" as const,
    value: { headers: {}, url: "https://fixture.example" },
  };
  assert.equal(
    connectionFingerprint("x", replacement, 1),
    connectionFingerprint("x", replacement, 2)
  );
});

test("failed conflict refresh preserves original conflict message rather than rejecting", async () => {
  const message = "配置已更新，输入仍保留。";
  assert.equal(
    await refreshConflictMessage(async () => undefined, message),
    message
  );
  const result = await refreshConflictMessage(async () => {
    throw new Error("network");
  }, message);
  assert.ok(result.startsWith(message));
  assert.ok(result.includes("刷新失败"));
});
test("friendly authentication preserves all custom headers and never silently drops non-Bearer authorization", async () => {
  const { authenticationKind, bearerValue, withBearer, suggestServerId } =
    await import("../../lib/agent/mcp-settings/editor");
  assert.equal(authenticationKind("{}"), "none");
  assert.equal(
    authenticationKind('{"Authorization":"Bearer secret"}'),
    "bearer"
  );
  assert.equal(
    authenticationKind('{"Authorization":"Bearer secret","X-App":"fixture"}'),
    "custom"
  );
  assert.equal(
    authenticationKind('{"Authorization":"Basic secret"}'),
    "custom"
  );
  assert.equal(bearerValue('{"authorization":"Bearer secret"}'), "secret");
  assert.deepEqual(JSON.parse(withBearer('{"X-App":"fixture"}', "TOKEN")), {
    Authorization: "Bearer TOKEN",
    "X-App": "fixture",
  });
  assert.match(suggestServerId("我的检索", "abc123"), /^[a-z][a-z0-9_]{0,30}$/);
});
test("new JSON-import IDs cannot replace existing managed or file connections, including after refreshed IDs", async () => {
  const { newConnectionIdConflict } = await import(
    "../../lib/agent/mcp-settings/editor"
  );
  assert.equal(
    newConnectionIdConflict("fixture", ["fixture", "file_server"], false),
    true
  );
  assert.equal(
    newConnectionIdConflict("file_server", ["fixture", "file_server"], false),
    true
  );
  assert.equal(newConnectionIdConflict("fixture", ["fixture"], true), false);
  assert.equal(newConnectionIdConflict("new", ["fixture"], false), false);
  assert.equal(newConnectionIdConflict("new", ["fixture", "new"], false), true);
});
