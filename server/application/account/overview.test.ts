import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAccountOverview } from "@/server/application/account/overview";
import type { PlatformBillingClient } from "@/server/application/platform/protocol";

const baseClient: PlatformBillingClient = {
  dispatch: async () => ({ permit: "permit" }),
  report: async () => undefined,
  reserve: async () => ({ holdId: "hold", reservedPoints: "1" }),
  sessionList: async () => ({
    balancePoints: "12.500000",
    requestId: "fixture",
    sessions: [
      {
        capturedPoints: "1.250000",
        chatId: "chat-1",
        createdAt: "2026-10-31T00:00:00.000Z",
        organizationId: null,
        reservedPoints: "1.250000",
        runId: null,
        sessionGroupId: "session-1",
        status: "completed",
        stepsCount: 1,
      },
    ],
  }),
  subscriptions: async () => ({
    organizationId: null,
    requestId: "fixture",
    subscriptions: [
      {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-11-30T00:00:00.000Z",
        currentPeriodStart: "2026-10-31T00:00:00.000Z",
        plan: {
          monthlyPoints: "100.000000",
          name: "Fixture Basic",
          slug: "fixture-basic",
        },
        provider: "synthetic",
        status: "active",
        subscriptionId: "sub-1",
      },
    ],
  }),
};

test("account overview projects connected balance and latest usage", async () => {
  const result = await loadAccountOverview({
    createClient: async () => baseClient,
    user: { email: "user@example.com", id: "user-1", name: "用户" },
  });

  assert.deepEqual(result, {
    account: { email: "user@example.com", name: "用户" },
    billing: { balancePoints: "12.500000", status: "connected" },
    recentUsage: {
      capturedPoints: "1.250000",
      chatId: "chat-1",
      createdAt: "2026-10-31T00:00:00.000Z",
      organizationId: null,
      reservedPoints: "1.250000",
      runId: null,
      sessionGroupId: "session-1",
      status: "completed",
      stepsCount: 1,
    },
    subscription: {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-11-30T00:00:00.000Z",
      planName: "Fixture Basic",
      status: "active",
    },
  });
});

test("account overview never turns a platform failure into a zero balance", async () => {
  const result = await loadAccountOverview({
    createClient: async () => ({
      ...baseClient,
      sessionList: () => Promise.reject(new Error("platform unavailable")),
    }),
    user: { email: "user@example.com", id: "user-1" },
  });

  assert.equal(result.billing.balancePoints, null);
  assert.equal(result.billing.status, "degraded");
  assert.equal(result.recentUsage, null);
  assert.equal(result.subscription, null);
});

test("account overview keeps the balance usable when subscription projection is unavailable", async () => {
  const result = await loadAccountOverview({
    createClient: async () => ({
      ...baseClient,
      subscriptions: () =>
        Promise.reject(new Error("subscription unavailable")),
    }),
    user: { email: "user@example.com", id: "user-1" },
  });

  assert.equal(result.billing.status, "connected");
  assert.equal(result.billing.balancePoints, "12.500000");
  assert.equal(result.subscription, null);
});
