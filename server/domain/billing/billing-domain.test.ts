import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveToolPrice,
  type ToolPriceCatalog,
} from "@/server/domain/billing/policy";
import {
  transitionBillingState,
  type BillingState,
  type BillingEvent,
} from "@/server/domain/billing/state-machine";
import type { DecimalString } from "@/server/domain/billing/types";

const points = (value: string) => value as DecimalString;

const catalog: ToolPriceCatalog = {
  version: "2026-10-30.1",
  default: "deny",
  tools: {
    "onebound/1688/item_search": {
      kind: "fixed_call",
      points: points("2"),
      unit: "call",
      chargeMode: "attempt",
    },
    "native_mcp/alibaba1688_product/find_product": {
      kind: "reported_unit",
      unit: "record",
      pointsPerUnit: points("1"),
      reserve: { strategy: "fixed_cap", capUnits: points("5") },
      overage: "manual_review",
      chargeMode: "success",
    },
    "crossref/works/get_work": {
      kind: "included",
      points: "0",
      unit: "call",
    },
  },
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
            kind: "fixed_call",
            points: "-1",
            unit: "call",
            chargeMode: "attempt",
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
    { type: "receipt", dispatchEvidence: "response", actualPoints: "2" },
    { type: "settle" },
  ];
  let state: BillingState = "idle";
  for (const event of events) {
    state = transitionBillingState(state, event);
  }
  assert.equal(state, "settled");
  assert.equal(
    transitionBillingState("dispatching", {
      type: "receipt",
      dispatchEvidence: "not_dispatched",
      actualPoints: "0",
    }),
    "released"
  );
  assert.throws(() => transitionBillingState("settled", { type: "dispatch" }));
});
