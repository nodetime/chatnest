import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "./logger";
import { runWithTraceId } from "./request-context";

function sink() {
  const lines: string[] = [];
  return {
    lines,
    stream: { write: (chunk: string) => void lines.push(chunk) },
  };
}

test("输出为 JSONL 且基础字段齐备", () => {
  const s = sink();
  const log = createLogger({ level: "info", stream: s.stream });
  log.info("hello");
  assert.equal(s.lines.length, 1);
  const entry = JSON.parse(s.lines[0]);
  assert.equal(entry.msg, "hello");
  assert.equal(entry.service, "chatnest");
  assert.ok(entry.time > 0);
  assert.equal(entry.level, 30);
});

test("traceId 经 mixin 自动注入", () => {
  const s = sink();
  const log = createLogger({ level: "info", stream: s.stream });
  runWithTraceId("0190-test-trace", () => {
    log.info("with-trace");
  });
  const entry = JSON.parse(s.lines[0]);
  assert.equal(entry.traceId, "0190-test-trace");
});

test("作用域外不携带 traceId", () => {
  const s = sink();
  const log = createLogger({ level: "info", stream: s.stream });
  log.info("no-trace");
  const entry = JSON.parse(s.lines[0]);
  assert.equal(entry.traceId, undefined);
});

test("敏感字段被 redact", () => {
  const s = sink();
  const log = createLogger({ level: "info", stream: s.stream });
  log.info(
    { authorization: "Bearer x", nested: { token: "t" }, password: "hunter2" },
    "leaky"
  );
  const entry = JSON.parse(s.lines[0]);
  assert.equal(entry.password, "[Redacted]");
  assert.equal(entry.authorization, "[Redacted]");
  assert.equal(entry.nested.token, "[Redacted]");
});

test("getLogger 子日志器携带 mod", () => {
  const s = sink();
  const log = createLogger({ level: "info", stream: s.stream });
  log.child({ mod: "chat" }).info("modded");
  const entry = JSON.parse(s.lines[0]);
  assert.equal(entry.mod, "chat");
});
