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
  const result = await around(context, async () => {
    calls++;
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("connected tool billing reserves, dispatches, claims sending and reports once", async () => {
  const events: string[] = [];
  let calls = 0;
  const around = createToolBillingAroundCall({
    mode: "connected",
    platform: {
      dispatch: async () => {
        events.push("dispatch");
        return { permit: "permit" };
      },
      report: async () => {
        events.push("report");
      },
      reserve: async () => {
        events.push("reserve");
        return { holdId: "hold-1", reservedPoints: "2" };
      },
    },
    operations: {
      claimSending: async () => {
        events.push("sending");
        return true;
      },
      create: async () => {
        events.push("ready");
      },
    },
  });
  const result = await around(context, async () => {
    calls++;
    return { ok: true };
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
  assert.deepEqual(events, ["ready", "reserve", "dispatch", "sending", "report"]);
});

test("connected mode never falls back to unmetered when platform reserve fails", async () => {
  let calls = 0;
  const around = createToolBillingAroundCall({
    mode: "connected",
    platform: {
      dispatch: async () => ({ permit: "never" }),
      report: async () => undefined,
      reserve: async () => {
        throw new Error("platform down");
      },
    },
    operations: { claimSending: async () => true, create: async () => undefined },
  });
  await assert.rejects(
    around(context, async () => {
      calls++;
      return "free";
    }),
    /platform down/,
  );
  assert.equal(calls, 0);
});

test("a losing sending CAS does not call the supplier or report", async () => {
  const events: string[] = [];
  const around = createToolBillingAroundCall({
    mode: "connected",
    platform: {
      dispatch: async () => ({ permit: "permit" }),
      report: async () => {
        events.push("report");
      },
      reserve: async () => ({ holdId: "hold-1", reservedPoints: "2" }),
    },
    operations: {
      claimSending: async () => false,
      create: async () => undefined,
    },
  });
  await assert.rejects(
    around(context, async () => {
      events.push("supplier");
    }),
    /already claimed/,
  );
  assert.deepEqual(events, []);
});
