import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { test } from "node:test";

function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void
) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return {
      close: () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        ),
      url: `http://127.0.0.1:${address.port}`,
    };
  });
}

function runWorker(baseUrl: string, extraEnv: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/platform-settlement-worker.mjs"],
        {
          cwd: process.cwd(),
          env: {
            CHATNEST_BASE_URL: baseUrl,
            CHATNEST_CONTROL_TOKEN: "control-secret",
            CHATNEST_WORKER_TIMEOUT_MS: "3000",
            NODE_ENV: "test",
            PATH: process.env.PATH,
            ...extraEnv,
          },
        }
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stderr, stdout }));
    }
  );
}

test("payment recovery reports per-event failures and rejects invented healthy summaries", async (t) => {
  for (const scenario of [
    "current",
    "healthy",
    "case-risk",
    "missing-failed",
    "missing-failed-empty",
    "inconsistent",
    "invalid",
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: isolated loopback fixture lifecycle.
    await t.test(scenario, async (context) => {
      const app = await listen((request, response) => {
        const empty =
          scenario === "healthy" ||
          scenario === "case-risk" ||
          scenario === "missing-failed-empty";
        const recovery = {
          current: {
            caseRisk: { dueSoonOrOverdue: 0, total: 0, withGap: 0 },
            events: [{ eventId: "fixture", status: 409 }],
            failed: 1,
            reconciled: 1,
            staleBefore: "2026-11-01T00:00:00.000Z",
          },
          invalid: { reconciled: 0, secret: "private-canary" },
        };
        const responseBody =
          scenario === "invalid"
            ? recovery.invalid
            : {
                ...recovery.current,
                ...(scenario === "case-risk"
                  ? {
                      caseRisk: { dueSoonOrOverdue: 1, total: 2, withGap: 1 },
                    }
                  : {}),
                events: empty ? [] : recovery.current.events,
                reconciled: empty ? 0 : 1,
                ...(scenario.startsWith("missing-failed")
                  ? { failed: undefined }
                  : { failed: scenario === "current" ? 1 : 0 }),
              };
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify(
            request.url?.endsWith("/payments/reconcile")
              ? responseBody
              : { deadLettered: 0, failed: 0, skipped: 0 }
          )
        );
      });
      context.after(async () => {
        await app.close();
      });
      const result = await runWorker(app.url, {
        PLATFORM_BASE_URL: app.url,
        PLATFORM_MODE: "connected",
        PLATFORM_SERVICE_TOKEN: "service-canary",
      });
      if (scenario === "case-risk") {
        assert.equal(result.code, 0);
        assert.deepEqual(JSON.parse(result.stderr), {
          code: "BILLING_ATTENTION",
          reasons: ["payment_case_due", "payment_case_gap"],
        });
        return;
      }
      if (scenario === "healthy") {
        assert.equal(result.code, 0);
        assert.equal(result.stderr, "");
        assert.deepEqual(JSON.parse(result.stdout).paymentRecovery, {
          caseRisk: { dueSoonOrOverdue: 0, total: 0, withGap: 0 },
          events: [],
          failed: 0,
          reconciled: 0,
          staleBefore: "2026-11-01T00:00:00.000Z",
        });
        return;
      }
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        scenario === "current"
          ? /payment_recovery_failed/
          : /payment_recovery_invalid/
      );
      if (scenario === "current") {
        assert.equal(JSON.parse(result.stdout).paymentRecovery.failed, 1);
      } else {
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /WORKER_FAILED/);
      }
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /private-canary|service-canary|control-secret/
      );
    });
  }
});

test("retryable settlement failure logs attention and exits non-zero, then recovers", async (t) => {
  let failed = 1;
  const app = await listen((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify(
        request.url === "/api/internal/billing/outbox"
          ? { deadLettered: 0, failed, processed: 0, succeeded: 0 }
          : { failed: 0, skipped: 0 }
      )
    );
  });
  t.after(app.close);
  const failure = await runWorker(app.url);
  assert.equal(failure.code, 1);
  assert.deepEqual(JSON.parse(failure.stderr), {
    code: "BILLING_ATTENTION",
    reasons: ["settlement_failed"],
  });
  failed = 0;
  const recovery = await runWorker(app.url);
  assert.equal(recovery.code, 0);
  assert.equal(recovery.stderr, "");
});

test("worker logs failure without posting alerts or maintaining alert history", async (t) => {
  const requests: string[] = [];
  const app = await listen((request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end('{"secret":"must-not-enter-logs"}');
  });
  t.after(app.close);
  const result = await runWorker(app.url, {
    CHATNEST_ALERT_WEBHOOK_URL: `${app.url}/unused-webhook`,
  });
  assert.equal(result.code, 1);
  assert.deepEqual(requests, ["/api/internal/billing/outbox"]);
  assert.deepEqual(JSON.parse(result.stderr), {
    code: "WORKER_FAILED",
    reason: "settlement_route_failed",
  });
});
