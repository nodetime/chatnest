// biome-ignore-all lint/suspicious/useAwait: async fixtures.
import assert from "node:assert/strict";
import { test } from "node:test";
import { alertEventSchema, createAlertEventHandler } from "./alert-history";

const event = {
  httpStatus: null,
  id: "11111111-1111-4111-8111-111111111111",
  kind: "worker_failed",
  outcome: "failed",
  reasons: ["timeout"],
};
test("alert history accepts only bounded facts and consistent delivery outcomes", () => {
  assert.equal(alertEventSchema.safeParse(event).success, true);
  for (const value of [
    { ...event, token: "canary" },
    { ...event, reasons: ["canary"] },
    { ...event, outcome: "delivered" },
    { ...event, httpStatus: 200, outcome: "failed" },
  ]) {
    assert.equal(alertEventSchema.safeParse(value).success, false);
  }
});
test("history authorizes before reading body, projects failures and rejects conflicts", async () => {
  let reads = 0;
  const record = async () => {
    reads += 1;
    return false;
  };
  const denied = createAlertEventHandler({ authorized: () => false, record });
  assert.equal(
    (
      await denied(
        new Request("http://localhost", { body: "canary", method: "POST" })
      )
    ).status,
    401
  );
  assert.equal(reads, 0);
  const allowed = createAlertEventHandler({ authorized: () => true, record });
  assert.equal(
    (
      await allowed(
        new Request("http://localhost", {
          body: JSON.stringify(event),
          method: "POST",
        })
      )
    ).status,
    409
  );
  const fail = createAlertEventHandler({
    authorized: () => true,
    record: async () => {
      throw new Error("canary");
    },
  });
  const response = await fail(
    new Request("http://localhost", {
      body: JSON.stringify(event),
      method: "POST",
    })
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /canary/);
});

test("history byte limit stops oversized multibyte input before recording", async () => {
  let writes = 0;
  const handler = createAlertEventHandler({
    authorized: () => true,
    record: async () => {
      writes += 1;
      return true;
    },
  });
  const response = await handler(
    new Request("http://localhost", { body: "中".repeat(2000), method: "POST" })
  );
  assert.equal(response.status, 413);
  assert.equal(writes, 0);
});
