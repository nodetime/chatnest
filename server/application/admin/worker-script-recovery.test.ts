import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { test } from "node:test";

type AlertPayload = {
  details?: {
    paymentRecovery?:
      | { skipped: true }
      | { failed: number; reconciled: number };
    reasons?: string[];
    settlement?: { deadLettered: number; failed: number };
  };
  kind?: string;
};

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

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function runWorker(
  baseUrl: string,
  alertUrl: string,
  extraEnv: Record<string, string> = {}
) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/platform-settlement-worker.mjs"],
        {
          cwd: process.cwd(),
          env: {
            CHATNEST_ALERT_WEBHOOK_URL: alertUrl,
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

test("worker alerts on an internal route failure without leaking credentials or response data", async (t) => {
  let alertPayload: AlertPayload | undefined;
  const sink = await listen(async (request, response) => {
    if (request.url === "/alert") {
      alertPayload = JSON.parse(await readBody(request));
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end();
  });
  const app = await listen((_request, response) => {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ code: "OUTBOX_UNAVAILABLE", secret: "upstream-secret" })
    );
  });
  t.after(async () => {
    await app.close();
    await sink.close();
  });

  const result = await runWorker(app.url, `${sink.url}/alert`);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /WORKER_FAILED/);
  assert.equal(alertPayload?.kind, "worker_failed");
  const serialized = JSON.stringify(alertPayload);
  assert.ok(serialized);
  assert.doesNotMatch(
    serialized,
    /control-secret|upstream-secret|OUTBOX_UNAVAILABLE/
  );
});

test("worker alerts bounded dead-letter attention and exits non-zero", async (t) => {
  let alertPayload: AlertPayload | undefined;
  const sink = await listen(async (request, response) => {
    if (request.url === "/alert") {
      alertPayload = JSON.parse(await readBody(request));
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end();
  });
  const app = await listen((request, response) => {
    if (request.url === "/api/internal/billing/outbox") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          deadLettered: 1,
          expired: 0,
          failed: 1,
          processed: 1,
          succeeded: 0,
        })
      );
      return;
    }
    if (request.url?.startsWith("/api/internal/account/")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          failed: 0,
          inspected: 0,
          purged: 0,
          sent: 0,
          skipped: 0,
        })
      );
      return;
    }
    response.writeHead(404).end();
  });
  t.after(async () => {
    await app.close();
    await sink.close();
  });

  const result = await runWorker(app.url, `${sink.url}/alert`);

  assert.equal(result.code, 1);
  assert.equal(alertPayload?.kind, "billing_attention");
  assert.deepEqual(alertPayload?.details?.reasons, [
    "settlement_dead_letter",
    "settlement_failed",
  ]);
  assert.deepEqual(alertPayload?.details?.paymentRecovery, { skipped: true });
  assert.deepEqual(alertPayload?.details?.settlement, {
    deadLettered: 1,
    failed: 1,
  });
  const serialized = JSON.stringify(alertPayload);
  assert.ok(serialized);
  assert.doesNotMatch(serialized, /control-secret|upstream-secret/);
});

test("worker_failed makes non-2xx and timeout delivery failures observable without sink secrets", async (t) => {
  for (const failure of ["http503", "timeout"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: each case owns and tears down its loopback services.
    await t.test(failure, { timeout: 12_000 }, async (context) => {
      const app = await listen((_request, response) => {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ detail: "app-body-secret" }));
      });
      const sink = await listen((_request, response) => {
        if (failure === "http503") {
          response.writeHead(503).end("sink-body-secret");
        }
      });
      context.after(async () => {
        await app.close();
        await sink.close();
      });
      const result = await runWorker(
        app.url,
        `${sink.url}/alert?token=sink-url-secret`
      );
      assert.equal(result.code, 1);
      assert.match(result.stderr, /WORKER_FAILED/);
      assert.match(result.stderr, /BILLING_ALERT_DELIVERY_FAILED/);
      assert.doesNotMatch(
        result.stderr + result.stdout,
        /app-body-secret|sink-body-secret|sink-url-secret|control-secret/
      );
    });
  }
});

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
      let alert: unknown;
      const sink = await listen(async (request, response) => {
        alert = JSON.parse(await readBody(request));
        response.writeHead(204).end();
      });
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
        await sink.close();
      });
      const result = await runWorker(app.url, sink.url, {
        PLATFORM_BASE_URL: app.url,
        PLATFORM_MODE: "connected",
        PLATFORM_SERVICE_TOKEN: "service-canary",
      });
      if (scenario === "case-risk") {
        assert.equal(result.code, 0);
        assert.deepEqual(alert, {
          details: {
            paymentRecovery: {
              caseRisk: { dueSoonOrOverdue: 1, total: 2, withGap: 1 },
              failed: 0,
              reconciled: 0,
            },
            reasons: ["payment_case_due", "payment_case_gap"],
            settlement: { deadLettered: 0, failed: 0 },
          },
          kind: "billing_attention",
          source: "chatnest-settlement-worker",
        });
        return;
      }
      if (scenario === "healthy") {
        assert.equal(result.code, 0);
        assert.equal(alert, undefined);
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
      const serialized = JSON.stringify(alert);
      assert.match(
        serialized,
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
        serialized + result.stdout + result.stderr,
        /private-canary|service-canary|control-secret/
      );
    });
  }
});

test("retryable settlement or grant failure exits non-zero even when alert history and sink succeed, then recovers", async (t) => {
  let failed = 1;
  let sinkEvents = 0;
  const history: string[] = [];
  const sink = await listen(async (request, response) => {
    const alert = JSON.parse(await readBody(request)) as AlertPayload;
    assert.deepEqual(alert.details?.reasons, ["settlement_failed"]);
    sinkEvents += 1;
    response.writeHead(204).end();
  });
  const app = await listen(async (request, response) => {
    if (request.url === "/api/internal/billing/alert-events") {
      history.push(JSON.parse(await readBody(request)).outcome);
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify(
        request.url === "/api/internal/billing/outbox"
          ? { deadLettered: 0, expired: 0, failed, processed: 0, succeeded: 0 }
          : { failed: 0, inspected: 0, purged: 0, sent: 0, skipped: 0 }
      )
    );
  });
  t.after(async () => {
    await app.close();
    await sink.close();
  });
  const failure = await runWorker(app.url, sink.url);
  assert.equal(failure.code, 1);
  assert.doesNotMatch(failure.stderr, /ALERT_HISTORY|ALERT_DELIVERY/);
  assert.deepEqual(history, ["pending", "delivered"]);
  assert.equal(sinkEvents, 1);
  failed = 0;
  const recovery = await runWorker(app.url, sink.url);
  assert.equal(recovery.code, 0);
  assert.equal(sinkEvents, 1);
});
