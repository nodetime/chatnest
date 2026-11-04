import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeUsagePages, UsageRequestScope } from "./usage-pagination";

test("usage paging appends by operation identity without mixing sessions", () => {
  const first = {
    session: { sessionGroupId: "a" },
    steps: [{ operationId: "one" }, { operationId: "two" }],
  };
  assert.deepEqual(
    mergeUsagePages(first, {
      session: { sessionGroupId: "a" },
      steps: [{ operationId: "two" }, { operationId: "three" }],
    }).steps.map((s) => s.operationId),
    ["one", "two", "three"]
  );
  assert.throws(
    () =>
      mergeUsagePages(first, { session: { sessionGroupId: "b" }, steps: [] }),
    /SESSION_PAGE_MISMATCH/
  );
});
test("switching or closing a session cancels and invalidates late pages", () => {
  const scope = new UsageRequestScope(),
    a = scope.begin(),
    b = scope.begin();
  assert.equal(a.signal.aborted, true);
  assert.equal(a.current(), false);
  assert.equal(b.current(), true);
  scope.cancel();
  assert.equal(b.current(), false);
});
