import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("deletion queue is admin-only, server-scoped and preserves billing facts", () => {
  const route = readFileSync(
    "app/api/admin/accounts/deletion-requests/route.ts",
    "utf8"
  );
  const page = readFileSync("app/admin/accounts/page.tsx", "utf8");
  const nav = readFileSync(
    "app/_components/admin/admin-navigation.tsx",
    "utf8"
  );
  const repository = readFileSync(
    "server/infrastructure/persistence/drizzle/account-repository.ts",
    "utf8"
  );
  const workerRoute = readFileSync(
    "app/api/internal/account/deletion-worker/route.ts",
    "utf8"
  );
  const retentionRoute = readFileSync(
    "app/api/internal/account/retention-worker/route.ts",
    "utf8"
  );
  const notificationRoute = readFileSync(
    "app/api/internal/account/notification-worker/route.ts",
    "utf8"
  );
  const workerScript = readFileSync(
    "scripts/platform-settlement-worker.mjs",
    "utf8"
  );

  assert.match(route, /resolvePlatformAdmin[\s\S]*"admin"/);
  assert.match(route, /sameOriginBrowserControl/);
  assert.match(route, /requestId: z\.uuid\(\)/);
  assert.doesNotMatch(route, /userId/);
  assert.match(page, /匿名化登录资料并撤销会话/);
  assert.match(page, /已匿名化/);
  assert.match(page, /已完成清理/);
  assert.match(page, /个人内容已清理/);
  assert.match(nav, /\/admin\/accounts/);
  assert.match(repository, /accountDeletionRequest/);
  assert.match(repository, /sessionRevision/);
  assert.match(repository, /completedBy/);
  assert.doesNotMatch(repository, /delete\(ledger|delete\(audit/i);
  assert.match(workerRoute, /CHATNEST_CONTROL_TOKEN/);
  assert.match(workerRoute, /runDeletionWorker/);
  assert.match(retentionRoute, /runRetentionWorker/);
  assert.match(notificationRoute, /runNotificationWorker/);
  assert.match(repository, /retentionPurgedAt/);
  assert.match(workerScript, /account\/deletion-worker/);
  assert.match(workerScript, /account\/retention-worker/);
  const acceptance = readFileSync("scripts/production-acceptance.mjs", "utf8");
  assert.match(acceptance, /account\/deletion-worker/);
  assert.match(acceptance, /deletion,/);
  assert.match(acceptance, /account\/notification-worker/);
  assert.match(acceptance, /account\/retention-worker/);
  assert.match(acceptance, /manifest\.json/);
  assert.match(workerScript, /payments\/reconcile/);
  assert.match(workerScript, /PAYMENT_RECONCILE_BATCH_SIZE/);
  assert.match(workerScript, /WORKER_FAILED/);
  assert.match(workerScript, /BILLING_ATTENTION/);
  assert.doesNotMatch(workerScript, /sendAlert|alert-events/);
  assert.match(workerScript, /reason:.*timeout/);
});
