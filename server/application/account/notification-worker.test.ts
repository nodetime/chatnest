import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runAccountNotificationWorkerOnce,
  sendDeletionNotification,
} from "@/server/application/account/notification-worker";

test("deletion notification webhook sends only the bounded event contract", async () => {
  const requests: Request[] = [];
  await sendDeletionNotification(
    {
      address: "user@example.test",
      requestId: "request-1",
      retentionUntil: "2026-12-01T00:00:00.000Z",
      tombstoneId: "tombstone-1",
    },
    {
      fetcher: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(new Response(null, { status: 202 }));
      },
      token: "fixture-notification-token",
      url: "https://notify.example.test/deletion",
    }
  );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].headers.get("Authorization"),
    "Bearer fixture-notification-token"
  );
  assert.deepEqual(await requests[0].json(), {
    address: "user@example.test",
    event: "account.deletion.completed",
    requestId: "request-1",
    retentionUntil: "2026-12-01T00:00:00.000Z",
    tombstoneId: "tombstone-1",
  });
});

test("notification worker retries pending rows and records sent status", async () => {
  const statuses: Array<{ requestId: string; status: string }> = [];
  const result = await runAccountNotificationWorkerOnce({
    notifier: async () => undefined,
    repository: {
      listPendingDeletionNotifications: () =>
        Promise.resolve([
          {
            address: "user@example.test",
            requestId: "request-1",
            retentionUntil: null,
            tombstoneId: "tombstone-1",
          },
        ]),
      markDeletionNotificationStatus: ({ requestId, status }) => {
        statuses.push({ requestId, status });
        return Promise.resolve();
      },
    },
  });

  assert.deepEqual(result, { failed: 0, inspected: 1, sent: 1 });
  assert.deepEqual(statuses, [{ requestId: "request-1", status: "sent" }]);
});
