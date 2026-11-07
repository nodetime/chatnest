import assert from "node:assert/strict";
import { test } from "node:test";
import { runAccountRetentionWorkerOnce } from "@/server/application/account/retention-worker";

test("account retention worker forwards a bounded batch and returns purge counts", async () => {
  let requestedLimit = 0;
  const result = await runAccountRetentionWorkerOnce({
    limit: 12,
    repository: (limit) => {
      requestedLimit = limit ?? 0;
      return Promise.resolve({ inspected: 2, purged: 2, skipped: 0 });
    },
  });

  assert.equal(requestedLimit, 12);
  assert.deepEqual(result, { inspected: 2, purged: 2, skipped: 0 });
});
