import assert from "node:assert/strict";
import { test } from "node:test";
import {
  replayDeadLetterSettlement,
  runSettlementWorkerOnce,
} from "@/server/application/platform/settlement-worker";
import type { BillingRepository } from "@/server/domain/billing/repository";

test("settlement worker claims and reports pending commands without replaying suppliers", async () => {
  const events: string[] = [];
  const result = await runSettlementWorkerOnce({
    client: {
      dispatch: async () => ({ permit: "unused" }),
      expireWalletGrants: async () => ({ expired: 0, requestId: "fixture" }),
      report: async () => undefined,
      reportInternal: () => {
        events.push("report");
        return Promise.resolve();
      },
      reserve: async () => ({ holdId: "unused", reservedPoints: "1" }),
    },
    repository: {
      claimSending: async () => true,
      claimSettlement: async () => true,
      createOperation: async () => undefined,
      enqueueSettlement: async () => undefined,
      finishSettlement: ({ state }) => {
        events.push(`finish:${state}`);
        return Promise.resolve();
      },
      listPendingSettlement: async () => [
        {
          attempts: 0,
          command: "report" as const,
          id: "outbox-1",
          operationId: "operation-1",
          payload: {
            attemptId: "attempt-1",
            operationId: "operation-1",
            outcome: "unknown" as const,
          },
        },
      ],
      saveReceipt: async () => undefined,
    },
  });
  assert.deepEqual(result, {
    deadLettered: 0,
    expired: 0,
    failed: 0,
    processed: 1,
    succeeded: 1,
  });
  assert.deepEqual(events, ["report", "finish:succeeded"]);
});

test("settlement worker backs off failed retries from the persisted attempt count", async () => {
  let retryAt: Date | undefined;
  const result = await runSettlementWorkerOnce({
    client: {
      dispatch: async () => ({ permit: "unused" }),
      expireWalletGrants: async () => ({ expired: 0, requestId: "fixture" }),
      report: async () => undefined,
      reportInternal: () => Promise.reject(new Error("platform unavailable")),
      reserve: async () => ({ holdId: "unused", reservedPoints: "1" }),
    },
    repository: {
      claimSending: async () => true,
      claimSettlement: async () => true,
      createOperation: async () => undefined,
      enqueueSettlement: async () => undefined,
      finishSettlement: ({ nextAttemptAt, state }) => {
        assert.equal(state, "failed");
        retryAt = nextAttemptAt;
        return Promise.resolve();
      },
      listPendingSettlement: async () => [
        {
          attempts: 3,
          command: "report" as const,
          id: "outbox-retry",
          operationId: "operation-retry",
          payload: {
            attemptId: "attempt-retry",
            operationId: "operation-retry",
            outcome: "unknown" as const,
          },
        },
      ],
      saveReceipt: async () => undefined,
    },
  });
  assert.equal(result.failed, 1);
  assert.equal(result.deadLettered, 0);
  assert.equal(result.succeeded, 0);
  assert.ok(retryAt);
  assert.ok(retryAt.getTime() >= Date.now() + 19_000);
});

test("settlement worker dead-letters a retry after the configured attempt limit", async () => {
  const events: string[] = [];
  const result = await runSettlementWorkerOnce({
    client: {
      dispatch: async () => ({ permit: "unused" }),
      expireWalletGrants: async () => ({ expired: 0, requestId: "fixture" }),
      report: async () => undefined,
      reportInternal: () => Promise.reject(new Error("platform unavailable")),
      reserve: async () => ({ holdId: "unused", reservedPoints: "1" }),
    },
    maxAttempts: 3,
    repository: {
      claimSending: async () => true,
      claimSettlement: async () => true,
      createOperation: async () => undefined,
      enqueueSettlement: async () => undefined,
      finishSettlement: ({ nextAttemptAt, state }) => {
        events.push(`${state}:${nextAttemptAt ? "scheduled" : "terminal"}`);
        return Promise.resolve();
      },
      listPendingSettlement: async () => [
        {
          attempts: 2,
          command: "report" as const,
          id: "outbox-dead-letter",
          operationId: "operation-dead-letter",
          payload: {
            attemptId: "attempt-dead-letter",
            operationId: "operation-dead-letter",
            outcome: "unknown" as const,
          },
        },
      ],
      saveReceipt: async () => undefined,
    },
  });

  assert.deepEqual(result, {
    deadLettered: 1,
    expired: 0,
    failed: 1,
    processed: 1,
    succeeded: 0,
  });
  assert.deepEqual(events, ["dead_letter:terminal"]);
});

test("manual replay requeues only a dead-letter settlement command", async () => {
  const ids: string[] = [];
  const repository = {
    requeueSettlement: (id: string) => {
      ids.push(id);
      return Promise.resolve(id === "dead-letter-1");
    },
  } as BillingRepository;

  assert.equal(
    await replayDeadLetterSettlement(repository, "dead-letter-1"),
    true
  );
  assert.equal(await replayDeadLetterSettlement(repository, "missing"), false);
  assert.deepEqual(ids, ["dead-letter-1", "missing"]);
});
