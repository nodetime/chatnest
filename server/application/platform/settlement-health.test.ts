import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("billing health exposes outbox backlog and dead-letter counts", () => {
  const route = readFileSync(
    "app/api/internal/billing/health/route.ts",
    "utf8"
  );
  const repository = readFileSync(
    "server/infrastructure/persistence/drizzle/billing-repository.ts",
    "utf8"
  );
  assert.match(route, /settlementHealth/);
  assert.match(repository, /groupBy\(settlementOutbox\.state\)/);
  assert.match(repository, /deadLettered/);
  assert.match(repository, /oldestPendingAt/);
});
