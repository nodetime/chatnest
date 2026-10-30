import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createToolBillingAroundCall } from "@/server/application/chat/tool-billing";
import { createPlatformBillingClient } from "@/server/application/platform/client";
import { createPlatformPointsFixtureServer } from "@/tests/support/platform-points-fixture-server";

test("HTTP platform fixture closes a fixed Porta-style tool charge exactly once", async () => {
  const fixture = createPlatformPointsFixtureServer();
  fixture.server.listen(0, "127.0.0.1");
  await once(fixture.server, "listening");
  const address = fixture.server.address();
  assert(address && typeof address !== "string");
  const events: string[] = [];
  const client = createPlatformBillingClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    serviceToken: "fixture-service",
    userToken: "fixture-user",
  });
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: () => {
        events.push("sending");
        return Promise.resolve(true);
      },
      create: () => {
        events.push("ready");
        return Promise.resolve();
      },
    },
    platform: client,
  });
  try {
    const result = await around(
      {
        attemptId: "attempt-fixture",
        canonicalToolKey: "onebound/1688/item_search",
        operationId: "operation-fixture",
        subjectId: "user-fixture",
        tool: { api: "item_search", platform: "1688", provider: "onebound" },
      },
      () => {
        events.push("supplier");
        return Promise.resolve({
          executionReceipt: { receiptId: "receipt-fixture" },
        });
      }
    );
    assert.deepEqual(result, {
      executionReceipt: { receiptId: "receipt-fixture" },
    });
    assert.deepEqual(events, ["ready", "sending", "supplier"]);
    assert.equal(fixture.balance, 8n);
    assert.equal(fixture.operationCount, 1);
  } finally {
    fixture.server.close();
    await once(fixture.server, "close");
  }
});
