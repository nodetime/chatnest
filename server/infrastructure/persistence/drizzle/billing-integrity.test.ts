import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  executionOperation,
  settlementOutbox,
} from "@/server/infrastructure/persistence/drizzle/schema";

test("billing retry keys are database-unique", () => {
  const operationAttempt = getTableConfig(executionOperation).indexes.find(
    (entry) => entry.config.name === "execution_operations_attempt_idx"
  );
  const settlementKey = getTableConfig(settlementOutbox).indexes.find(
    (entry) => entry.config.name === "settlement_outbox_idempotency_idx"
  );

  assert.equal(operationAttempt?.config.unique, true);
  assert.equal(settlementKey?.config.unique, true);
});
