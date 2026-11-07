import assert from "node:assert/strict";
import { test } from "node:test";
import { runAccountDeletionWorkerOnce } from "@/server/application/account/deletion-worker";

test("account deletion worker processes only requested rows with a system actor", async () => {
  const calls: Array<{ completedBy: string; requestId: string }> = [];
  const result = await runAccountDeletionWorkerOnce({
    repository: {
      completeDeletionRequest: (input) => {
        calls.push(input);
        return Promise.resolve("completed" as const);
      },
      listDeletionRequests: () =>
        Promise.resolve([
          {
            completedAt: null,
            completedBy: null,
            email: "one@example.test",
            id: "request-1",
            name: "一号",
            notificationStatus: "not_configured" as const,
            reason: null,
            remoteDeactivationError: null,
            remoteDeactivationRequestId: null,
            remoteDeactivationStatus: "not_required" as const,
            requestedAt: "2026-10-31T00:00:00.000Z",
            retentionUntil: null,
            status: "requested" as const,
            tombstoneId: null,
            userId: "user-1",
          },
          {
            completedAt: "2026-10-31T00:00:00.000Z",
            completedBy: "admin-1",
            email: "two@example.test",
            id: "request-2",
            name: "二号",
            notificationStatus: "not_configured" as const,
            reason: null,
            remoteDeactivationError: null,
            remoteDeactivationRequestId: null,
            remoteDeactivationStatus: "completed" as const,
            requestedAt: "2026-10-31T00:00:00.000Z",
            retentionUntil: "2026-11-30T00:00:00.000Z",
            status: "completed" as const,
            tombstoneId: "tombstone-2",
            userId: "user-2",
          },
        ]),
      markDeletionRemoteFailure: () => Promise.resolve(),
    },
  });

  assert.deepEqual(result, { completed: 1, inspected: 2, skipped: 1 });
  assert.deepEqual(calls, [
    {
      completedBy: "system:account-deletion-worker",
      requestId: "request-1",
    },
  ]);
});

test("account deletion worker deactivates the platform subject before local anonymization", async () => {
  const events: string[] = [];
  const result = await runAccountDeletionWorkerOnce({
    deactivatePlatformIdentity: ({ subject }) => {
      events.push(`platform:${subject}`);
      return Promise.resolve(undefined);
    },
    repository: {
      completeDeletionRequest: ({ requestId }) => {
        events.push(`local:${requestId}`);
        return Promise.resolve("completed" as const);
      },
      listDeletionRequests: async () => [
        {
          completedAt: null,
          completedBy: null,
          email: "one@example.test",
          id: "request-1",
          name: "一号",
          notificationStatus: "not_configured" as const,
          reason: null,
          remoteDeactivationError: null,
          remoteDeactivationRequestId: null,
          remoteDeactivationStatus: "not_required" as const,
          requestedAt: "2026-10-31T00:00:00.000Z",
          retentionUntil: null,
          status: "requested" as const,
          tombstoneId: null,
          userId: "user-1",
        },
      ],
      markDeletionRemoteFailure: () => Promise.resolve(),
    },
  });
  assert.deepEqual(result, { completed: 1, inspected: 1, skipped: 0 });
  assert.deepEqual(events, ["platform:user-1", "local:request-1"]);
});

test("account deletion worker persists remote deactivation failures for retry", async () => {
  const failures: Array<{ error: string; requestId: string }> = [];
  const result = await runAccountDeletionWorkerOnce({
    deactivatePlatformIdentity: () =>
      Promise.reject(new Error("PLATFORM_TIMEOUT")),
    repository: {
      completeDeletionRequest: () => Promise.resolve("completed" as const),
      listDeletionRequests: async () => [
        {
          completedAt: null,
          completedBy: null,
          email: "one@example.test",
          id: "request-1",
          name: "一号",
          notificationStatus: "not_configured" as const,
          reason: null,
          remoteDeactivationError: null,
          remoteDeactivationRequestId: null,
          remoteDeactivationStatus: "not_required" as const,
          requestedAt: "2026-10-31T00:00:00.000Z",
          retentionUntil: null,
          status: "requested" as const,
          tombstoneId: null,
          userId: "user-1",
        },
      ],
      markDeletionRemoteFailure: (input) => {
        failures.push(input);
        return Promise.resolve();
      },
    },
  });
  assert.deepEqual(result, { completed: 0, inspected: 1, skipped: 1 });
  assert.deepEqual(failures, [
    { error: "PLATFORM_TIMEOUT", requestId: "request-1" },
  ]);
});
