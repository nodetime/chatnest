import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveToolPrice,
  settleReportedUnits,
  type ToolPriceCatalog,
} from "@/server/domain/billing/policy";
import {
  type BillingEvent,
  type BillingState,
  transitionBillingState,
} from "@/server/domain/billing/state-machine";
import type { DecimalString } from "@/server/domain/billing/types";

const points = (value: string) => value as DecimalString;

const catalog: ToolPriceCatalog = {
  default: "deny",
  tools: {
    "crossref/works/get_work": {
      kind: "included",
      points: "0",
      unit: "call",
    },
    "native_mcp/alibaba1688_product/find_product": {
      chargeMode: "success",
      kind: "reported_unit",
      overage: "manual_review",
      pointsPerUnit: points("1"),
      reserve: { capUnits: points("5"), strategy: "fixed_cap" },
      unit: "record",
    },
    "onebound/1688/item_search": {
      chargeMode: "attempt",
      kind: "fixed_call",
      points: points("2"),
      unit: "call",
    },
  },
  version: "2026-10-30.1",
};

test("resolves different fixed, metered, included and denied tool policies", () => {
  assert.deepEqual(
    resolveToolPrice(catalog, "onebound/1688/item_search"),
    catalog.tools["onebound/1688/item_search"]
  );
  assert.equal(
    resolveToolPrice(catalog, "native_mcp/alibaba1688_product/find_product")
      ?.kind,
    "reported_unit"
  );
  assert.equal(
    resolveToolPrice(catalog, "crossref/works/get_work")?.kind,
    "included"
  );
  assert.equal(resolveToolPrice(catalog, "unknown/tool"), null);
});

test("rejects malformed points policy at runtime", () => {
  assert.throws(() =>
    resolveToolPrice(
      {
        ...catalog,
        tools: {
          broken: {
            chargeMode: "attempt",
            kind: "fixed_call",
            points: "-1",
            unit: "call",
          },
        },
      } as unknown as ToolPriceCatalog,
      "broken"
    )
  );
});

test("accepts only legal billing state transitions", () => {
  const events: BillingEvent[] = [
    { type: "reserve" },
    { type: "dispatch" },
    { actualPoints: "2", dispatchEvidence: "response", type: "receipt" },
    { type: "settle" },
  ];
  let state: BillingState = "idle";
  for (const event of events) {
    state = transitionBillingState(state, event);
  }
  assert.equal(state, "settled");
  assert.equal(
    transitionBillingState("dispatching", {
      actualPoints: "0",
      dispatchEvidence: "not_dispatched",
      type: "receipt",
    }),
    "released"
  );
  assert.throws(() => transitionBillingState("settled", { type: "dispatch" }));
});

test("settles reported units against a cap and exposes overage without auto-charging", () => {
  const policy = catalog.tools["native_mcp/alibaba1688_product/find_product"];
  assert.equal(policy?.kind, "reported_unit");
  if (policy?.kind !== "reported_unit") {
    return;
  }
  assert.deepEqual(settleReportedUnits(policy, "3"), {
    actualPoints: "3",
    overage: false,
    surplusPoints: "2",
  });
  assert.deepEqual(settleReportedUnits(policy, "8"), {
    actualPoints: "8",
    overage: true,
    surplusPoints: "0",
  });
});
