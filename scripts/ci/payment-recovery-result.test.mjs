import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePaymentRecovery } from "../payment-recovery-result.mjs";

const caseRisk = { dueSoonOrOverdue: 0, total: 0, withGap: 0 };
const mixed = {
  caseRisk,
  events: [
    { eventId: "one", status: 200 },
    { eventId: "two", status: 409 },
  ],
  reconciled: 2,
  staleBefore: "2026-11-01T00:00:00.000Z",
};
test("payment recovery validates current per-event facts without filling missing fields", () => {
  assert.equal(normalizePaymentRecovery({ ...mixed, failed: 1 }).failed, 1);
  assert.deepEqual(
    normalizePaymentRecovery({
      caseRisk,
      events: [],
      failed: 0,
      reconciled: 0,
      staleBefore: mixed.staleBefore,
    }),
    {
      caseRisk,
      events: [],
      failed: 0,
      reconciled: 0,
      staleBefore: mixed.staleBefore,
    }
  );
});
test("complete event lists without required failed are rejected, including an empty list", () => {
  for (const value of [
    mixed,
    { caseRisk, events: [], reconciled: 0, staleBefore: mixed.staleBefore },
  ]) {
    assert.throws(
      () => normalizePaymentRecovery(value),
      (error) => error.message === "PAYMENT_RECOVERY_INVALID"
    );
  }
});
test("current failed counts include every non-2xx status and preserve the current response", () => {
  const value = {
    caseRisk,
    events: [199, 200, 299, 300, 599].map((status) => ({
      eventId: String(status),
      status,
    })),
    failed: 3,
    reconciled: 5,
    staleBefore: mixed.staleBefore,
  };
  assert.deepEqual(normalizePaymentRecovery(value), value);
});
test("missing, inconsistent or malformed recovery facts never become zero failures", () => {
  for (const value of [
    { reconciled: 0 },
    { ...mixed, failed: 0 },
    { ...mixed, failed: 1, reconciled: 1 },
    {
      ...mixed,
      events: [{ eventId: "bad", status: 99 }],
      failed: 1,
      reconciled: 1,
    },
    { ...mixed, failed: 1, secret: "private-canary" },
    { ...mixed, caseRisk: undefined, failed: 1 },
    {
      ...mixed,
      caseRisk: { dueSoonOrOverdue: 2, total: 1, withGap: 0 },
      failed: 1,
    },
    {
      ...mixed,
      caseRisk: { dueSoonOrOverdue: 0, total: 1, withGap: 2 },
      failed: 1,
    },
  ]) {
    assert.throws(
      () => normalizePaymentRecovery(value),
      (error) => error.message === "PAYMENT_RECOVERY_INVALID"
    );
  }
});
