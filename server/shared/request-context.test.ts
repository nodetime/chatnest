import assert from "node:assert/strict";
import { test } from "node:test";
import { getTraceId, runWithTraceId } from "./request-context";

test("runWithTraceId 建立作用域且 await 不丢失", async () => {
  await runWithTraceId("trace-a", async () => {
    assert.equal(getTraceId(), "trace-a");
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(getTraceId(), "trace-a");
  });
  assert.equal(getTraceId(), undefined);
});

test("并发作用域互不串扰", async () => {
  await Promise.all([
    runWithTraceId("trace-1", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(getTraceId(), "trace-1");
    }),
    runWithTraceId("trace-2", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      assert.equal(getTraceId(), "trace-2");
    }),
  ]);
});

test("嵌套作用域内层覆盖、退出后恢复", () => {
  runWithTraceId("outer", () => {
    assert.equal(getTraceId(), "outer");
    runWithTraceId("inner", () => {
      assert.equal(getTraceId(), "inner");
    });
    assert.equal(getTraceId(), "outer");
  });
});
