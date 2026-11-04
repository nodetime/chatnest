// biome-ignore-all lint/performance/noAwaitInLoops: isolated acceptance uses ordered boundary assertions.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { hash } from "bcrypt-ts";
import { deliverAlert } from "./alert-history.mjs";

async function main() {
  const url = new URL(process.env.POSTGRES_URL || "http://invalid");
  assert(
    process.env.CHATNEST_ALERT_HISTORY_ACCEPTANCE === "1" &&
      url.protocol === "postgres:" &&
      url.hostname === "127.0.0.1" &&
      url.port === "55432" &&
      url.pathname === "/chatnest_alert_history_acceptance" &&
      !url.search &&
      !url.hash,
    "EXACT_OWNED_ALERT_DATABASE_REQUIRED"
  );
  const { getDatabaseClient } = await import(
    "../server/infrastructure/persistence/drizzle/connection"
  );
  const { alertHistoryRepository: history } = await import(
    "../server/infrastructure/persistence/drizzle/alert-history-repository"
  );
  const { createAlertEventHandler } = await import(
    "../server/application/admin/alert-history"
  );
  const sql = getDatabaseClient();
  async function seed(count: number) {
    await sql`TRUNCATE alert_delivery_events`;
    const [clock] =
      await sql`SELECT to_char(date_trunc('milliseconds',NOW()-INTERVAL '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`;
    for (let i = 0; i < count; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
      await sql`INSERT INTO alert_delivery_events(id,kind,reasons,outcome,http_status,created_at) VALUES(${id},'worker_failed','["timeout"]','delivered',204,${clock.at}::text::timestamptz+${Math.floor(i / 3)}*INTERVAL '1 microsecond')`;
    }
  }
  async function times(id: string) {
    const [row] =
      await sql`SELECT created_at::text AS created,updated_at::text AS updated FROM alert_delivery_events WHERE id=${id}`;
    return row;
  }
  try {
    for (const count of [0, 30, 31, 61]) {
      await seed(count);
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await history.list(cursor);
        assert(page.items.length <= 30);
        assert.equal(page.retentionDays, 30);
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(seen.length, count);
      assert.equal(new Set(seen).size, count);
      assert.deepEqual(seen, [...seen].sort().reverse());
    }
    await seed(61);
    const first = await history.list();
    assert(first.nextCursor);
    assert.match(first.nextCursor, /\.\d{6}Z\|/);
    const last = first.items.at(-1);
    assert(last);
    await sql`DELETE FROM alert_delivery_events WHERE id=${last.id}`;
    const second = await history.list(first.nextCursor);
    assert.equal(second.items.length, 30);
    assert(
      !second.items.some((item) =>
        first.items.some((old) => old.id === item.id)
      )
    );
    await sql`INSERT INTO alert_delivery_events(id,kind,reasons,outcome,created_at) VALUES('99999999-9999-4999-8999-999999999999','worker_failed','["timeout"]','failed',NOW()-INTERVAL '31 days')`;
    const [olderCursor] =
      await sql`SELECT to_char((NOW()-INTERVAL '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`;
    assert.equal(
      (
        await history.list(
          `${olderCursor.at}|11111111-1111-4111-8111-111111111111`
        )
      ).items.length,
      0
    );
    assert.equal((await history.purge()).deleted, 1);
    await seed(0);
    const fact = {
      httpStatus: null,
      id: "11111111-1111-4111-8111-111111111111",
      kind: "worker_failed" as const,
      outcome: "pending" as const,
      reasons: ["timeout" as const],
    };
    assert(await history.record(fact));
    const pending = await times(fact.id);
    await sql`SELECT pg_sleep(0.02)`;
    assert(await history.record(fact));
    assert.deepEqual(await times(fact.id), pending);
    const terminal = {
      ...fact,
      httpStatus: 204,
      outcome: "delivered" as const,
    };
    assert(await history.record(terminal));
    const completed = await times(fact.id);
    assert.notEqual(completed.updated, pending.updated);
    assert.equal(completed.created, pending.created);
    await sql`SELECT pg_sleep(0.02)`;
    assert(
      (
        await Promise.all(
          Array.from({ length: 4 }, () => history.record(terminal))
        )
      ).every(Boolean)
    );
    assert.deepEqual(await times(fact.id), completed);
    assert.equal(await history.record({ ...fact, outcome: "failed" }), false);
    assert.equal(await history.record(fact), false);
    assert.equal(
      await history.record({ ...terminal, reasons: ["unexpected"] }),
      false
    );
    // Actual transport loss after the production handler commits; one sink, one fact, same timestamps on replay.
    await seed(0);
    const token = process.env.CHATNEST_CONTROL_TOKEN;
    assert(token);
    const handler = createAlertEventHandler({
      authorized: (request) =>
        request.headers.get("x-chatnest-control-token") === token,
      record: history.record,
    });
    const attempts = { delivered: 0, pending: 0 };
    let sink = 0;
    let historyFailure = 0;
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      if (request.url === "/sink") {
        sink += 1;
        response.writeHead(204);
        response.end();
        return;
      }
      const body = Buffer.concat(chunks).toString();
      const input = JSON.parse(body) as {
        id: string;
        outcome: "pending" | "delivered";
      };
      const result = await handler(
        new Request("http://127.0.0.1/api/internal/billing/alert-events", {
          body,
          headers: { "x-chatnest-control-token": token },
          method: "POST",
        })
      );
      assert.equal(result.status, 200);
      attempts[input.outcome] += 1;
      if (attempts[input.outcome] === 1) {
        response.destroy();
        return;
      }
      response.writeHead(result.status);
      response.end(await result.text());
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    try {
      const baseUrl = `http://127.0.0.1:${address.port}`;
      assert(
        await deliverAlert({
          alertUrl: `${baseUrl}/sink`,
          baseUrl,
          controlToken: token,
          details: { reason: "timeout" },
          kind: "worker_failed",
          onHistoryFailure: () => {
            historyFailure += 1;
          },
        })
      );
      assert.deepEqual(attempts, { delivered: 2, pending: 2 });
      assert.equal(sink, 1);
      assert.equal(historyFailure, 0);
      const rows = await sql`SELECT id FROM alert_delivery_events`;
      assert.equal(rows.length, 1);
      const finished = await times(rows[0].id);
      assert(await history.record({ ...terminal, id: rows[0].id }));
      assert.deepEqual(await times(rows[0].id), finished);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await seed(61);
    assert(process.env.ALERT_ACCEPTANCE_PASSWORD, "FIXTURE_PASSWORD_REQUIRED");
    const password = await hash(process.env.ALERT_ACCEPTANCE_PASSWORD, 10);
    await sql`INSERT INTO users(id,email,password) VALUES('55555555-5555-4555-8555-555555555555','alerts-acceptance@example.test',${password})`;
    console.log(
      JSON.stringify({
        browserSeeded: 61,
        committedResponseLoss: true,
        deletedCursorRow: true,
        idempotentTimestamps: true,
        microsecondAndTiedKeys: true,
        pageBoundaries: [0, 30, 31, 61],
        retention: true,
        scope: "isolated-alert-history",
        sinkAttempts: 1,
      })
    );
  } finally {
    await sql.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
