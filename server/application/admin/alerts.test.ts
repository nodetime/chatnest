// biome-ignore-all lint/suspicious/useAwait: async dependency fixtures.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdminAlertsService, createAlertsHandler } from "./alerts";

const health = {
  deadLettered: 0,
  failed: 0,
  oldestPendingAt: null,
  pending: 0,
  processing: 0,
};
const overview = {
  adminRole: "admin",
  balancePoints: "0",
  capturedPoints: "0",
  nextCursor: null,
  operationCount: 0,
  organizationBalancePoints: "0",
  payment: {
    failed: 0,
    ignored: 0,
    inboxCount: 0,
    processed: 0,
    processing: 0,
    received: 0,
    refundDue: 0,
    successRate: 0,
    webhookLagSeconds: 0,
  },
  paymentAttention: [],
  paymentCases: { dueSoonOrOverdue: 0, items: [], total: 0, withGap: 0 },
  personalBalancePoints: "0",
  policyCount: 0,
  recentOperations: [],
  reconcilePending: 0,
  states: {},
  walletAccounting: { active: 0, frozen: 0, invalid: 0, missing: 0, staged: 0 },
};
const now = () => new Date("2026-11-01T12:00:00.000Z");

test("alerts reads independently, carries per-request identity, and reports only configuration evidence", async () => {
  const subjects: string[] = [];
  const service = createAdminAlertsService({
    now,
    readPaymentOverview: async (subject) => {
      subjects.push(subject);
      return overview;
    },
    readSettlement: async () => health,
    webhookConfigured: true,
  });
  const snapshot = await service.snapshot({ adminSubject: "admin-one" });
  await service.snapshot({ adminSubject: "admin-two" });
  assert.deepEqual(subjects, ["admin-one", "admin-two"]);
  assert.deepEqual(snapshot.settlement, {
    checkedAt: now().toISOString(),
    data: health,
    status: "available",
  });
  assert.equal(snapshot.payment.status, "available");
  assert.equal(snapshot.delivery.verification, "unknown");
  assert.equal(snapshot.delivery.history, "not_connected");
  assert.equal(snapshot.delivery.webhookConfigured, true);
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /balancePoints|adminRole|admin-one/
  );
});

test("alerts reports case risk counters without order identities or amounts", async () => {
  const result = await createAdminAlertsService({
    now,
    readPaymentOverview: async () => ({
      ...overview,
      paymentCases: {
        dueSoonOrOverdue: 1,
        items: [
          {
            caseCount: 2,
            checkoutId: "private-order-for-admin",
            disputedPoints: "129",
            disputeGapPoints: "0",
            dueAt: "2026-11-01T13:00:00.000Z",
            refundGapPoints: "0",
            reviewRequired: true,
            sourcePaymentEventId: 42,
          },
        ],
        total: 1,
        withGap: 0,
      },
    }),
    webhookConfigured: false,
  }).snapshot({ adminSubject: "admin" });
  assert.equal(result.payment.status, "available");
  assert.deepEqual(result.payment.data?.caseRisk, {
    dueSoonOrOverdue: 1,
    total: 1,
    withGap: 0,
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-order-for-admin|disputedPoints|sourcePaymentEventId/
  );
});

test("partial source failures and missing payment fields never become healthy zeros", async () => {
  for (const field of [
    "refundDue",
    "inboxCount",
    "paymentAttention",
    "paymentCases",
  ]) {
    const incomplete = structuredClone(overview) as any;
    if (field === "paymentAttention" || field === "paymentCases") {
      delete incomplete[field];
    } else {
      delete incomplete.payment[field];
    }
    const service = createAdminAlertsService({
      now,
      readPaymentOverview: async () => incomplete,
      readSettlement: async () => health,
      webhookConfigured: false,
    });
    // biome-ignore lint/performance/noAwaitInLoops: table test.
    const result = await service.snapshot({ adminSubject: "admin" });
    assert.equal(result.settlement.status, "available");
    assert.deepEqual(result.payment, {
      checkedAt: now().toISOString(),
      data: null,
      reason: "invalid_response",
      status: "unavailable",
    });
  }
  const partial = await createAdminAlertsService({
    now,
    readPaymentOverview: async () => overview,
    readSettlement: async () => {
      throw new Error("secret");
    },
    webhookConfigured: false,
  }).snapshot({ adminSubject: "admin" });
  assert.equal(partial.settlement.status, "unavailable");
  assert.equal(partial.payment.status, "available");
  assert.doesNotMatch(JSON.stringify(partial), /secret/);
  const missing = await createAdminAlertsService({
    now,
    webhookConfigured: false,
  }).snapshot({ adminSubject: "admin" });
  assert.equal(missing.settlement.status, "unavailable");
  assert.equal(missing.payment.status, "unavailable");
});

test("alerts authorization precedes all reads and every response is private no-store", async () => {
  let reads = 0;
  const handler = createAlertsHandler({
    authorize: async () => false,
    session: async () => ({ id: "admin", type: "regular" }),
    snapshot: async () => {
      reads += 1;
      throw new Error("not reached");
    },
  });
  const response = await handler(
    new Request("http://localhost/api/admin/alerts")
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(reads, 0);
  let subject = "";
  const allowed = createAlertsHandler({
    authorize: async () => true,
    session: async () => ({ id: "request-admin", type: "regular" }),
    snapshot: async (input) => {
      subject = input.adminSubject;
      throw new Error("private-canary");
    },
  });
  const failure = await allowed(
    new Request("http://localhost/api/admin/alerts")
  );
  assert.equal(subject, "request-admin");
  assert.equal(failure.status, 500);
  assert.equal(failure.headers.get("cache-control"), "private, no-store");
  assert.doesNotMatch(await failure.text(), /private-canary/);
});

test("history cursor is passed through and pagination metadata is mandatory", async () => {
  const cursor =
    "2026-11-02T12:00:00.000123Z|11111111-1111-4111-8111-111111111111";
  let observed: string | undefined;
  const service = createAdminAlertsService({
    now,
    readHistory: async (input?: string) => {
      observed = input;
      return { items: [], nextCursor: null, retentionDays: 30 };
    },
    readSettlement: async () => health,
    webhookConfigured: false,
  });
  const page = await service.snapshot({
    adminSubject: "admin",
    historyCursor: cursor,
  });
  assert.equal(observed, cursor);
  assert.equal(page.alertHistory?.status, "available");
  const invalid = await createAdminAlertsService({
    now,
    readHistory: async () => ({ items: [], retentionDays: 30 }),
    readSettlement: async () => health,
    webhookConfigured: false,
  }).snapshot({ adminSubject: "admin" });
  assert.equal(invalid.alertHistory?.status, "unavailable");
  assert.equal(invalid.settlement.status, "available");
});

test("alerts authorizes before strict cursor query parsing and rejects invalid requests without reads", async () => {
  let calls = 0;
  let received: unknown;
  const snapshot = async (input: unknown) => {
    calls += 1;
    received = input;
    return createAdminAlertsService({ now, webhookConfigured: false }).snapshot(
      { adminSubject: "admin" }
    );
  };
  const request = (query: string) =>
    new Request(`http://localhost/api/admin/alerts${query}`);
  const denied = createAlertsHandler({
    authorize: async () => false,
    session: async () => ({ id: "admin" }),
    snapshot,
  });
  assert.equal((await denied(request("?historyCursor=invalid"))).status, 403);
  const allowed = createAlertsHandler({
    authorize: async () => true,
    session: async () => ({ id: "admin" }),
    snapshot,
  });
  const cursor =
    "2026-11-02T12:00:00.000123Z|11111111-1111-4111-8111-111111111111";
  for (const query of [
    "?historyCursor=",
    "?other=1",
    "?historyCursor=bad",
    `?historyCursor=${"x".repeat(1000)}`,
    `?historyCursor=${encodeURIComponent(cursor)}&historyCursor=${encodeURIComponent(cursor)}`,
    `?historyCursor=${encodeURIComponent(cursor.replace("000123Z", "000Z"))}`,
    `?historyCursor=${encodeURIComponent(cursor.replace("11-02", "02-30"))}`,
    `?historyCursor=${encodeURIComponent(cursor.replace(/111111111111$/, "canary"))}`,
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: boundary table.
    const response = await allowed(request(query));
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(calls, 0);
  assert.equal(
    (await allowed(request(`?historyCursor=${encodeURIComponent(cursor)}`)))
      .status,
    200
  );
  assert.deepEqual(received, { adminSubject: "admin", historyCursor: cursor });
});
