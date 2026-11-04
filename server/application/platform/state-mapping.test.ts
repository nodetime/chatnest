import assert from "node:assert/strict";
import { test } from "node:test";
import {
  billingStateFromPlatformState,
  parsePlatformOperationState,
  platformStateForBillingState,
} from "./state-mapping";

test("maps local execution states to the Payload money-state vocabulary", () => {
  assert.equal(platformStateForBillingState("idle"), null);
  assert.equal(platformStateForBillingState("reserved"), "reserved");
  assert.equal(platformStateForBillingState("dispatching"), "dispatched");
  assert.equal(platformStateForBillingState("settling"), "dispatched");
  assert.equal(platformStateForBillingState("settled"), "settled");
  assert.equal(platformStateForBillingState("released"), "released");
  assert.equal(
    platformStateForBillingState("reconcile_pending"),
    "reconcile_pending"
  );
  assert.equal(
    platformStateForBillingState("overage_pending"),
    "overage_pending"
  );
  assert.equal(platformStateForBillingState("adjusted", "capture"), "settled");
  assert.equal(platformStateForBillingState("adjusted", "release"), "released");
  assert.throws(
    () => platformStateForBillingState("adjusted"),
    /adjusted state requires resolution/
  );
});

test("maps Payload operation states back without inventing intermediate money states", () => {
  assert.throws(() => parsePlatformOperationState("dispatching"));
  assert.throws(() => parsePlatformOperationState("settling"));
  assert.throws(() => billingStateFromPlatformState("dispatching"));
  assert.throws(() => billingStateFromPlatformState("settling"));
  assert.equal(parsePlatformOperationState("settled"), "settled");
  assert.equal(billingStateFromPlatformState("reserved"), "reserved");
  assert.equal(billingStateFromPlatformState("dispatched"), "dispatching");
  assert.equal(billingStateFromPlatformState("settled"), "settled");
  assert.equal(billingStateFromPlatformState("released"), "released");
  assert.equal(
    billingStateFromPlatformState("reconcile_pending"),
    "reconcile_pending"
  );
  assert.equal(
    billingStateFromPlatformState("overage_pending"),
    "overage_pending"
  );
  assert.throws(
    () => billingStateFromPlatformState("unknown"),
    /Unknown platform operation state/
  );
});

test("rejects unknown platform states at the protocol boundary", () => {
  assert.throws(
    () => parsePlatformOperationState("unknown"),
    /Unknown platform operation state/
  );
});
