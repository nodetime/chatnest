import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolBillingAroundCall } from "@/server/application/chat/tool-billing";

const context = {
  attemptId: "attempt-1",
  canonicalToolKey: "onebound/1688/item_search",
  operationId: "operation-1",
  subjectId: "user-1",
};

test("standalone tool billing is explicitly unmetered and calls next once", async () => {
  let calls = 0;
  const around = createToolBillingAroundCall({ mode: "standalone" });
  const result = await around(context, () => {
    calls += 1;
    return Promise.resolve("ok");
  });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("connected tool billing claims sending, reserves, dispatches and reports once", async () => {
  const events: string[] = [];
  let calls = 0;
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: () => {
        events.push("sending");
        return Promise.resolve(true);
      },
      create: () => {
        events.push("ready");
        return Promise.resolve();
      },
      enqueueSettlement: () => Promise.resolve(),
    },
    platform: {
      dispatch: () => {
        events.push("dispatch");
        return Promise.resolve({ permit: "permit" });
      },
      report: () => {
        events.push("report");
        return Promise.resolve();
      },
      reserve: () => {
        events.push("reserve");
        return Promise.resolve({ holdId: "hold-1", reservedPoints: "2" });
      },
    },
  });
  const result = await around(context, () => {
    calls += 1;
    return Promise.resolve({ ok: true });
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
  assert.deepEqual(events, [
    "ready",
    "sending",
    "reserve",
    "dispatch",
    "report",
  ]);
});

test("connected tool billing forwards Porta receipts from MCP _meta", async () => {
  let reported: { executionReceipt?: unknown } | undefined;
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: async () => true,
      create: async () => undefined,
      enqueueSettlement: () => Promise.resolve(),
    },
    platform: {
      dispatch: async () => ({ permit: "permit" }),
      report: (input) => {
        reported = input;
        return Promise.resolve();
      },
      reserve: async () => ({ holdId: "hold-1", reservedPoints: "2" }),
    },
  });
  await around(context, async () => ({
    _meta: { "porta/executionReceipt": { receiptId: "receipt-meta" } },
    ok: true,
  }));
  assert.deepEqual(reported?.executionReceipt, {
    receiptId: "receipt-meta",
  });
});

test("connected tool billing marks the local operation settled after report", async () => {
  let settledOperationId: string | undefined;
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: async () => true,
      create: async () => undefined,
      enqueueSettlement: () => Promise.resolve(),
      markSettled: ({ operationId }) => {
        settledOperationId = operationId;
        return Promise.resolve();
      },
    },
    platform: {
      dispatch: async () => ({ permit: "permit" }),
      report: async () => undefined,
      reserve: async () => ({ holdId: "hold-1", reservedPoints: "2" }),
    },
  });

  await around(context, async () => ({ ok: true }));
  assert.equal(settledOperationId, "operation-1");
});

test("connected tool billing forwards native Porta receipts nested in _meta.porta", async () => {
  let reported: { executionReceipt?: unknown } | undefined;
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: async () => true,
      create: async () => undefined,
      enqueueSettlement: () => Promise.resolve(),
    },
    platform: {
      dispatch: async () => ({ permit: "permit" }),
      report: (input) => {
        reported = input;
        return Promise.resolve();
      },
      reserve: async () => ({ holdId: "hold-1", reservedPoints: "2" }),
    },
  });
  await around(context, async () => ({
    _meta: {
      porta: { executionReceipt: { receiptId: "receipt-native-meta" } },
    },
    ok: true,
  }));
  assert.deepEqual(reported?.executionReceipt, {
    receiptId: "receipt-native-meta",
  });
});

test("connected mode never falls back to unmetered when platform reserve fails", async () => {
  let calls = 0;
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: async () => true,
      create: async () => undefined,
      enqueueSettlement: () => Promise.resolve(),
    },
    platform: {
      dispatch: () => Promise.resolve({ permit: "never" }),
      report: () => Promise.resolve(),
      reserve: () => Promise.reject(new Error("platform down")),
    },
  });
  await assert.rejects(
    around(context, () => {
      calls += 1;
      return Promise.resolve("free");
    }),
    /platform down/
  );
  assert.equal(calls, 0);
});

test("a losing sending CAS does not call the supplier or report", async () => {
  const events: string[] = [];
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: () => Promise.resolve(false),
      create: () => Promise.resolve(),
      enqueueSettlement: () => Promise.resolve(),
    },
    platform: {
      dispatch: async () => ({ permit: "permit" }),
      report: () => {
        events.push("report");
        return Promise.resolve();
      },
      reserve: () => Promise.resolve({ holdId: "hold-1", reservedPoints: "2" }),
    },
  });
  await assert.rejects(
    around(context, () => {
      events.push("supplier");
      return Promise.resolve();
    }),
    /already claimed/
  );
  assert.deepEqual(events, []);
});

test("tool dispatch failure releases the same attempt without invoking the supplier", async () => {
  const reports: unknown[] = [];
  const around = createToolBillingAroundCall({
    mode: "connected",
    operations: {
      claimSending: async () => true,
      create: async () => undefined,
      enqueueSettlement: () => Promise.resolve(),
    },
    platform: {
      dispatch: () => Promise.reject(new Error("lost permit response")),
      report: async () => assert.fail("non-internal report used"),
      reportInternal: (input) => {
        reports.push(input);
        return Promise.resolve();
      },
      reserve: async () => ({ holdId: "hold-1", reservedPoints: "2" }),
    },
  });
  await assert.rejects(
    around(context, async () => assert.fail("supplier called")),
    /lost permit response/
  );
  assert.deepEqual(reports, [
    {
      attemptId: context.attemptId,
      operationId: context.operationId,
      outcome: "not_dispatched",
    },
  ]);
});
