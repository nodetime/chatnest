import assert from "node:assert/strict";
import { test } from "node:test";
import { platformRoute, platformRoutes } from "./generated/routes";
import {
  platformBodySchema,
  platformQuerySchema,
  platformResponseSchema,
} from "./generated/wire";

test("all 34 declared operations resolve concrete status validators and body ownership", () => {
  assert.equal(platformRoutes.length, 34);
  for (const route of platformRoutes) {
    for (const status of Object.keys(route.responses)) {
      assert.ok(platformResponseSchema(route.id, Number(status)));
    }
    assert.equal(
      platformBodySchema(route.id) !== null,
      route.bodySchema !== null
    );
  }
  assert.equal(
    platformRoute("billingReserve").path,
    "/platform/v1/operations/reserve"
  );
  assert.equal(platformBodySchema("billingDispatch"), null);
  assert.equal(
    platformRoute("billingExecuteDisputeReview").path,
    "/platform/v1/internal/admin/billing/dispute-reviews/execute"
  );
  assert.throws(
    () => platformResponseSchema("billingListPlans", 299),
    /UNDECLARED_RESPONSE_STATUS/
  );
});
test("wire lookup validates owner-specific errors and rejects omitted success facts", () => {
  const error = {
    code: "ADMIN_REQUIRED",
    message: "denied",
    requestId: "fixture",
  };
  assert.equal(
    platformResponseSchema("billingListBillingAudit", 403).safeParse(error)
      .success,
    true
  );
  assert.equal(
    platformResponseSchema("billingListBillingAudit", 200).safeParse({})
      .success,
    false
  );
  assert.equal(
    platformResponseSchema("portaReceiptStatus", 401).safeParse({
      porta_error: { code: "UNAUTHORIZED", message: "denied" },
    }).success,
    true
  );
  assert.equal(
    platformResponseSchema("portaReceiptStatus", 401).safeParse(error).success,
    false
  );
});
test("payment wire validators distinguish duplicate, ignored, subscription and wallet results", () => {
  const validate = platformResponseSchema("paymentPaymentWebhookHandler", 200);
  for (const value of [
    { eventId: "fixture", status: "processed" },
    {
      eventId: "fixture",
      paymentId: 1,
      reason: "unsupported event",
      status: "ignored",
    },
    {
      eventId: "fixture",
      paymentId: 1,
      status: "processed",
      subscriptionId: "fixture-sub",
      subscriptionStatus: "active",
    },
    {
      balancePoints: "10",
      eventId: "fixture",
      organizationId: null,
      paymentId: 1,
      status: "processed",
    },
  ]) {
    assert.equal(validate.safeParse(value).success, true);
  }
  assert.equal(
    validate.safeParse({
      balancePoints: "10",
      eventId: "fixture",
      status: "processed",
    }).success,
    false
  );
  assert.equal(
    platformResponseSchema("paymentReplayPaymentById", 200).safeParse({
      eventId: "42",
      replayed: false,
      status: "processed",
    }).success,
    true
  );
});

test("BFF query boundary rejects prototype keys instead of letting strict Zod skip them", async () => {
  const { parsePlatformQuery } = await import("./request-validation");
  for (const operation of [
    "billingListBillingAudit",
    "billingInternalAdminCapability",
  ] as const) {
    for (const query of [
      "__proto__=x",
      "constructor=x",
      "prototype=x",
      "extra=x",
      "limit=1&limit=2",
    ]) {
      assert.throws(
        () =>
          parsePlatformQuery<unknown>(
            platformQuerySchema(operation),
            new URLSearchParams(query)
          ),
        query
      );
    }
  }
  assert.deepEqual(
    parsePlatformQuery(
      platformQuerySchema("billingListBillingAudit"),
      new URLSearchParams("limit=10&scope=billing")
    ),
    { limit: "10", scope: "billing" }
  );
});
