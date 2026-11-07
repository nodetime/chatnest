import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { z } from "zod";
import { renderContract } from "./contract-artifacts.mjs";
import { emitZod } from "./contract-emitter.mjs";

const root = new URL("../../docs/contracts/platform-points/", import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const source = json("source.json");
const manifest = json("manifest.json");
const rendered = renderContract(source, manifest);
const ajv = addFormats(new Ajv2020({ allowUnionTypes: true, strict: true }));
ajv.addSchema(rendered.bundle, "contract");
const validates = (name, value) => {
  const jsonSchema = ajv.compile({ $ref: `contract#/$defs/${name}` });
  const runtime = new Function(
    "z",
    `return ${emitZod(source.definitions[name], source.definitions)}`
  )(z);
  assert.equal(
    runtime.safeParse(value).success,
    jsonSchema(value),
    `${name}: JSON Schema/Zod differ`
  );
  return jsonSchema(value);
};

test("native Refund facts are typed once without conflating snapshots and point hints", () => {
  const core = {
    eventId: "evt_refund",
    eventType: "payment.refunded",
    provider: "stripe",
    providerPaymentId: "pi_refund",
    refund: { amountMinor: 33, chargeId: "ch_refund", state: "succeeded" },
    refundId: "re_refund",
  };
  assert.equal(validates("NormalizedPaymentEvent", core), true);
  for (const refund of [
    { ...core.refund, amountMinor: 0 },
    { ...core.refund, amountMinor: 1.5 },
    { ...core.refund, chargeId: "" },
    { ...core.refund, state: "unknown" },
    { ...core.refund, points: "33" },
  ]) {
    assert.equal(
      validates("NormalizedPaymentEvent", { ...core, refund }),
      false
    );
  }
});

test("payment object references have one canonical native shape and normalized fact", () => {
  const event = {
    created: 1_793_692_800,
    data: { object: {} },
    id: "evt_ref",
    type: "charge.succeeded",
  };
  for (const payment_intent of [
    null,
    "pi_shared",
    { id: "pi_shared", object: "payment_intent", status: "succeeded" },
  ]) {
    assert.equal(
      validates("StripeWebhookRequest", {
        ...event,
        data: { object: { payment_intent } },
      }),
      true
    );
  }
  for (const payment_intent of [
    true,
    12,
    [],
    {},
    "",
    { id: "pi_shared" },
    { id: 12, object: "payment_intent" },
    { id: "pi_shared", object: "charge" },
  ]) {
    assert.equal(
      validates("StripeWebhookRequest", {
        ...event,
        data: { object: { payment_intent } },
      }),
      false
    );
  }
  assert.equal(
    validates("NormalizedPaymentEvent", {
      eventId: "evt_ref",
      eventType: "payment.succeeded",
      provider: "stripe",
      providerPaymentId: "pi_shared",
    }),
    true
  );
});

test("success vectors execute independent JSON Schema and generated Zod validation", () => {
  for (const fixtureName of ["tool-success.json", "model-success.json"]) {
    const fixture = json(`fixtures/${fixtureName}`);
    for (const [name, value] of [
      ["OperationReserveRequest", fixture.reserve.request],
      ["OperationReserveResponse", fixture.reserve.response],
      ["OperationDispatchResponse", fixture.dispatch.response],
      ["ExecutionPermit", fixture.dispatch.permitPayload],
      ["OperationReportRequest", fixture.report.request],
      ["OperationReportResponse", fixture.report.response],
    ]) {
      assert.equal(validates(name, value), true, `${fixtureName}:${name}`);
    }
    if (fixture.porta) {
      assert.equal(validates("ExecutionReceipt", fixture.porta.receipt), true);
    }
  }
});

test("receipt mandatory facts and bounded supplier units reject malformed vectors", () => {
  const valid = json("fixtures/tool-success.json").porta.receipt;
  for (const key of ["dispatchEvidence", "httpStatus", "supplierUnits"]) {
    const value = { ...valid };
    delete value[key];
    assert.equal(validates("ExecutionReceipt", value), false, key);
  }
  for (const value of [
    { ...valid, extra: "secret" },
    { ...valid, supplierUnits: { ["x".repeat(129)]: "1" } },
    { ...valid, supplierUnits: { requests: "1".repeat(129) } },
    { ...valid, httpStatus: 99 },
  ]) {
    assert.equal(validates("ExecutionReceipt", value), false);
  }
});

test("source mutations alter generated content, digest and actual validation", () => {
  const changed = structuredClone(source);
  changed.definitions.ExecutionPermit.properties.signature.maxLength = 1;
  const next = renderContract(changed, manifest);
  assert.notEqual(next.digest, rendered.digest);
  assert.notEqual(next.validators, rendered.validators);
  assert.notEqual(next.openapi, rendered.openapi);
  assert.notDeepEqual(next.jsonSchemas, rendered.jsonSchemas);
});

test("published schemas remain independently compilable after adding local references", () => {
  const changed = structuredClone(source);
  changed.definitions.TestPoint = { pattern: "^[0-9]+$", type: "string" };
  changed.definitions.ExecutionPermit.properties.reservedPoints = {
    $ref: "#/$defs/TestPoint",
  };
  const next = renderContract(changed, manifest);
  for (const schema of Object.values(next.jsonSchemas)) {
    assert.doesNotThrow(() =>
      addFormats(new Ajv2020({ allowUnionTypes: true, strict: true })).compile(
        schema
      )
    );
  }
});

test("date-time wire profile agrees for offsets, calendar boundaries and rejected variants", () => {
  const permit = json("fixtures/tool-success.json").dispatch.permitPayload;
  for (const [issuedAt, expected] of [
    ["2024-02-29T23:59:59.123456Z", true],
    ["2024-02-29T12:00:00+08:00", true],
    ["2025-02-29T00:00:00Z", false],
    ["2024-02-29t12:00:00z", false],
    ["2024-02-29 12:00:00Z", false],
    ["2016-12-31T23:59:60Z", false],
    ["2024-02-29T12:00Z", false],
  ]) {
    assert.equal(
      validates("ExecutionPermit", { ...permit, issuedAt }),
      expected,
      issuedAt
    );
  }
});

test("required, enum, precision, length and unknown-field mutations change executable validators", () => {
  const tool = json("fixtures/tool-success.json");
  const mutations = [
    {
      after: true,
      before: false,
      change: (schema) => {
        schema.required = schema.required.filter((key) => key !== "httpStatus");
      },
      file: "receipt.json",
      name: "ExecutionReceipt",
      value: { ...tool.porta.receipt, httpStatus: undefined },
    },
    {
      after: false,
      before: true,
      change: (schema) => {
        schema.properties.chargeMode.enum = ["free"];
      },
      file: "permit.json",
      name: "ExecutionPermit",
      value: tool.dispatch.permitPayload,
    },
    {
      after: false,
      before: true,
      change: (schema) => {
        schema.properties.reservedPoints.pattern = "^[0-9]+$";
      },
      file: "permit.json",
      name: "ExecutionPermit",
      value: tool.dispatch.permitPayload,
    },
    {
      after: false,
      before: true,
      change: (schema) => {
        schema.properties.signature.maxLength = 1;
      },
      file: "permit.json",
      name: "ExecutionPermit",
      value: tool.dispatch.permitPayload,
    },
    {
      after: true,
      before: false,
      change: (schema) => {
        schema.additionalProperties = true;
      },
      file: "receipt.json",
      name: "ExecutionReceipt",
      value: { ...tool.porta.receipt, extra: true },
    },
  ];
  for (const mutation of mutations) {
    assert.equal(validates(mutation.name, mutation.value), mutation.before);
    const changed = structuredClone(source);
    mutation.change(changed.definitions[mutation.name]);
    const next = renderContract(changed, manifest);
    const validate = addFormats(
      new Ajv2020({ allowUnionTypes: true, strict: true })
    ).compile(next.jsonSchemas[mutation.file]);
    const runtime = new Function(
      "z",
      `return ${emitZod(changed.definitions[mutation.name], changed.definitions)}`
    )(z);
    assert.equal(validate(mutation.value), mutation.after);
    assert.equal(runtime.safeParse(mutation.value).success, mutation.after);
    assert.notEqual(next.digest, rendered.digest);
  }
});

test("invalid source keyword values fail at generation, not in emitted runtime code", () => {
  const changed = structuredClone(source);
  changed.definitions.ExecutionPermit.properties.signature.maxLength = -1;
  assert.throws(
    () => renderContract(changed, manifest),
    /INVALID_SOURCE_SCHEMA/
  );
});

test("every published operation has an owner and a concrete success DTO, not generic Success", () => {
  const operations = Object.values(source.openapi.paths).flatMap((path) =>
    Object.entries(path)
      .filter(([method]) => ["get", "post"].includes(method))
      .map(([, operation]) => operation)
  );
  assert.equal(operations.length, 34);
  for (const operation of operations) {
    assert.ok(operation.operationId);
    assert.ok(operation["x-runtime"]?.owner);
    const successes = Object.entries(operation.responses).filter(([status]) =>
      /^2\d\d$/.test(status)
    );
    assert.ok(successes.length, operation.operationId);
    for (const [, response] of successes) {
      const name = response.content?.[
        "application/json"
      ]?.schema?.$ref?.replace("#/$defs/", "");
      assert.ok(name && source.definitions[name], operation.operationId);
    }
  }
});

test("wire DTOs preserve supported numeric webhook and trim-normalized inputs", () => {
  for (const field of ["points", "refundedGrantPoints"]) {
    assert.equal(
      validates("PaymentWebhook", {
        eventType: "credit",
        providerEventId: "fixture",
        [field]: 10,
      }),
      true
    );
  }
  assert.equal(
    validates("PlatformPlan", {
      active: true,
      currency: "USD",
      monthlyPoints: "1",
      name: "Fixture",
      priceCents: 1,
      priceVersion: null,
      slug: "fixture",
    }),
    true
  );
  for (const name of ["ApprovalRequest", "WalletAdjustmentRequest"]) {
    const value =
      name === "ApprovalRequest"
        ? {
            action: "reconcile",
            decision: "release_reserved",
            resourceId: "fixture",
            revision: "rev",
          }
        : { deltaPoints: "1" };
    assert.equal(
      validates(name, { ...value, reason: ` ${"a".repeat(500)} ` }),
      true
    );
  }
  const route =
    source.openapi.paths["/internal/payments/events/{eventId}/replay"].post;
  assert.equal(
    route.parameters.find((parameter) => parameter.name === "eventId").schema
      .maxLength,
    10
  );
});

test("payment recovery CLI validator is regenerated from the canonical DTO", () => {
  const changed = structuredClone(source);
  changed.definitions.PaymentReconcileResponse.properties.failed.maximum = 1;
  const next = renderContract(changed, manifest);
  assert.notEqual(next.workerValidators, rendered.workerValidators);
  assert.match(rendered.workerValidators, /PaymentRecoveryWireSchema/);
  assert.equal(
    validates("PaymentReconcileResponse", {
      caseRisk: { dueSoonOrOverdue: 0, total: 0, withGap: 0 },
      events: [],
      failed: 0,
      reconciled: 0,
      staleBefore: "2026-11-01T00:00:00.000Z",
    }),
    true
  );
  assert.equal(
    validates("PaymentReconcileResponse", {
      caseRisk: { dueSoonOrOverdue: 0, total: 0, withGap: 0 },
      events: [],
      reconciled: 0,
      staleBefore: "2026-11-01T00:00:00.000Z",
    }),
    false
  );
});

test("currency minor units reject fractional, negative and unsafe values", () => {
  for (const priceCents of [0.5, -1, 9_007_199_254_740_992]) {
    assert.equal(
      validates("PlatformPlan", {
        active: true,
        currency: "USD",
        monthlyPoints: "1",
        name: "Fixture",
        priceCents,
        priceVersion: null,
        slug: "fixture",
      }),
      false
    );
  }
});

test("operation report identity and usage are bounded with only canonical executionReceipt", () => {
  const { receipt } = json("fixtures/tool-success.json").porta;
  const base = {
    attemptId: receipt.attemptId,
    operationId: receipt.operationId,
    outcome: "response",
  };
  assert.equal(
    validates("OperationReportRequest", { ...base, executionReceipt: receipt }),
    true
  );
  assert.equal(
    validates("OperationReportRequest", { ...base, receipt }),
    false
  );
  assert.equal(
    validates("OperationReportRequest", { ...base, operationId: "" }),
    false
  );
  assert.equal(
    validates("OperationReportRequest", {
      ...base,
      usage: { inputTokens: 9_007_199_254_740_992, outputTokens: 0 },
    }),
    false
  );
});

test("money admin request schemas reject unknown fields instead of preserving a second protocol", () => {
  assert.equal(
    validates("ReconcileRequest", {
      decision: "release_reserved",
      extra: true,
    }),
    false
  );
  assert.equal(
    validates("WalletAdjustmentRequest", {
      deltaPoints: "1",
      extra: true,
      reason: "verified",
    }),
    false
  );
});

test("overview date wire has independent JSON Schema and Zod calendar parity", () => {
  for (const [value, expected] of [
    ["2024-02-29", true],
    ["2000-02-29", true],
    ["2026-11-02T08:00:00+08:00", true],
    ["2026-11-02T00:00:00.123Z", true],
    ["2026-11-02T00:00:00.123456Z", false],
    ["2026-11-02T00:00:00.0009Z", false],
    ["2025-02-29", false],
    ["1900-02-29", false],
    ["2026-02-31", false],
    ["2026-11-2", false],
    ["11/02/2026", false],
    [" 2026-11-02", false],
    ["2026-11-02T00:00:00", false],
    ["", false],
  ]) {
    assert.equal(validates("OverviewDate", value), expected, value);
  }
});

test("approval actions use one current request shape and preserve explicit wallet snapshot facts", () => {
  const wallet = {
    action: "wallet_adjust",
    deltaPoints: "-2.5",
    reason: "explicit reason",
    resourceId: "2",
  };
  assert.equal(validates("ApprovalRequest", wallet), true);
  assert.equal(
    validates("ApprovalRequest", { ...wallet, revision: "old" }),
    false
  );
  assert.equal(
    validates("ApprovalRequest", { ...wallet, decision: "release_reserved" }),
    false
  );
  assert.equal(
    validates("ApprovalRequest", { ...wallet, deltaPoints: "1e1" }),
    false
  );
  const reconciliation = {
    action: "reconcile",
    decision: "release_reserved",
    reason: "explicit reason",
    resourceId: "op",
    revision: "current",
  };
  assert.equal(validates("ApprovalRequest", reconciliation), true);
  const { revision: _revision, ...missing } = reconciliation;
  assert.equal(validates("ApprovalRequest", missing), false);
  assert.equal(
    validates("ApprovalRequest", { ...reconciliation, organizationId: 1 }),
    false
  );
});

test("C checkout command rejects unknown fields and untransportable idempotency keys", () => {
  const value = { idempotencyKey: "ascii-key", planSlug: "plan" };
  assert.equal(validates("CheckoutIntentRequest", value), true);
  assert.equal(
    validates("CheckoutIntentRequest", { ...value, extra: true }),
    false
  );
  assert.equal(
    validates("CheckoutIntentRequest", { ...value, idempotencyKey: "😀" }),
    false
  );
  assert.equal(
    validates("WalletAdjustmentRequest", {
      deltaPoints: "1",
      idempotencyKey: "😀",
      reason: "fixture",
    }),
    false
  );
});

test("request correlation ID has one generated definition matching the audit budget", () => {
  assert.deepEqual(source.definitions.RequestId, {
    maxLength: 128,
    minLength: 1,
    type: "string",
  });
  assert.deepEqual(source.openapi.components.parameters.RequestId.schema, {
    $ref: "#/$defs/RequestId",
  });
  assert.equal(validates("RequestId", "a".repeat(128)), true);
  assert.equal(validates("RequestId", ""), false);
  assert.equal(validates("RequestId", "a".repeat(129)), false);
});
test("each Payload operation declares the same optional correlation header exactly once", () => {
  let count = 0;
  for (const item of Object.values(source.openapi.paths)) {
    for (const operation of Object.values(item)) {
      if (!operation?.["x-runtime"]?.owner.startsWith("payload-")) {
        continue;
      }
      const params = [
        ...(item.parameters ?? []),
        ...(operation.parameters ?? []),
      ].map((p) =>
        p.$ref
          ? source.openapi.components.parameters[p.$ref.split("/").at(-1)]
          : p
      );
      const headers = params.filter(
        (p) => p.in === "header" && p.name.toLowerCase() === "x-request-id"
      );
      assert.equal(headers.length, 1, operation.operationId);
      assert.equal(headers[0].required, false);
      assert.deepEqual(headers[0].schema, { $ref: "#/$defs/RequestId" });
      count += 1;
    }
  }
  assert.equal(count, 33);
});

test("attempt IDs share one URI-addressable profile across permit, operation and receipt", () => {
  assert.ok(source.definitions.AttemptId);
  for (const name of [
    "OperationReserveRequest",
    "OperationReportRequest",
    "ExecutionPermit",
    "ExecutionReceipt",
    "BillingOperation",
    "SessionStep",
    "PortaReceiptStatusResponse",
  ]) {
    assert.deepEqual(
      source.definitions[name].properties.attemptId,
      { $ref: "#/$defs/AttemptId" },
      name
    );
  }
  const path = source.openapi.paths[
    "/internal/v1/receipts/{attemptId}"
  ].get.parameters.find((p) => p.name === "attemptId");
  assert.deepEqual(path.schema, { $ref: "#/$defs/AttemptId" });
  for (const id of [
    "雪".repeat(128),
    "😀".repeat(128),
    "a/b?c#d",
    "literal%2F",
    "e\u0301",
    "é",
    ".\n",
  ]) {
    assert.equal(validates("AttemptId", id), true);
  }
  for (const id of [
    "",
    ".",
    "..",
    "\u0000",
    "\ud800",
    "\udfff",
    "雪".repeat(129),
    "😀".repeat(129),
  ]) {
    assert.equal(validates("AttemptId", id), false);
  }
});
test("receipt transient journal and output failures have a generated503 contract", () => {
  assert.equal(
    source.openapi.paths["/internal/v1/receipts/{attemptId}"].get.responses[
      "503"
    ]?.content["application/json"].schema.$ref,
    "#/$defs/PortaError"
  );
});

test("intentional NUL denial emits a local lint annotation while retaining the canonical pattern", () => {
  const expression = emitZod(source.definitions.AttemptId, source.definitions);
  assert.match(
    expression,
    /biome-ignore lint\/suspicious\/noControlCharactersInRegex/
  );
  const runtime = new Function("z", `return ${expression}`)(z);
  assert.equal(runtime.safeParse("\u0000").success, false);
  assert.equal(runtime.safeParse("😀".repeat(128)).success, true);
});

test("normalized payment core facts agree across JSON Schema and generated Zod", () => {
  const facts = {
    amountCents: 40,
    currency: "USD",
    eventId: "evt_opaque雪",
    eventType: "payment.refunded",
    organizationId: 11,
    points: "-4.5",
    provider: "synthetic",
    userId: 7,
  };
  assert.equal(validates("NormalizedPaymentEvent", facts), true);
  for (const value of [
    { ...facts, userId: true },
    { ...facts, userId: "7" },
    { ...facts, userId: 0 },
    { ...facts, organizationId: 9_007_199_254_740_992 },
    { ...facts, currency: "usd" },
    { ...facts, points: -4.5 },
    { ...facts, amountCents: 0.1 },
    { ...facts, eventId: "\u0000" },
    { ...facts, eventId: "\ud800" },
    { ...facts, eventId: " " },
    { ...facts, eventId: "x".repeat(257) },
    { ...facts, grossAmountMinor: 40 },
  ]) {
    assert.equal(validates("NormalizedPaymentEvent", value), false);
  }
  for (const points of [
    "0",
    "-0.1",
    "9999999999999999999.999999",
    "-9999999999999999999.999999",
  ]) {
    assert.equal(
      validates("NormalizedPaymentEvent", { ...facts, points }),
      true
    );
  }
});

test("provider raw contracts and subscription/time facts share generated validation", () => {
  assert.equal(source.definitions.NormalizedWebhookRequest, undefined);
  const generic = {
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    eventType: "subscription.updated",
    occurredAt: "2026-11-03T08:00:00Z",
    planSlug: "plan",
    providerEventId: "evt_raw",
    status: "past_due",
    subscriptionId: "sub_1",
  };
  assert.equal(validates("PaymentWebhook", generic), true);
  assert.equal(validates("ProviderWebhookRequest", generic), true);
  for (const value of [
    { ...generic, status: "unknown" },
    { ...generic, cancelAtPeriodEnd: "false" },
    { ...generic, currentPeriodEnd: "2026-02-30T00:00:00Z" },
    { ...generic, expiresAt: false },
    { ...generic, timestamp: "2026-11-03T08:00:00Z" },
  ]) {
    assert.equal(validates("PaymentWebhook", value), false);
  }
  const native = {
    created: 1_793_692_800,
    data: { object: { created: 1, provider_extension: true } },
    id: "evt_native",
    provider_extension: true,
    type: "charge.succeeded",
  };
  assert.equal(validates("StripeWebhookRequest", native), true);
  assert.equal(validates("ProviderWebhookRequest", native), true);
  for (const created of [
    undefined,
    null,
    true,
    "1793692800",
    1.5,
    -1,
    253_402_300_800,
  ]) {
    const value = { ...native, created };
    assert.equal(validates("StripeWebhookRequest", value), false);
  }
  const facts = {
    eventId: "evt",
    eventType: "subscription.updated",
    occurredAt: generic.occurredAt,
    provider: "fixture",
    subscription: {
      cancelAtPeriodEnd: false,
      currentPeriodStart: null,
      planSlug: "plan",
      status: "past_due",
      subscriptionId: "sub_1",
    },
  };
  assert.equal(validates("NormalizedPaymentEvent", facts), true);
  assert.equal(
    validates("NormalizedPaymentEvent", {
      ...facts,
      subscription: { ...facts.subscription, status: undefined },
    }),
    false
  );
});

test("native Stripe consumed payment proof fields share canonical strict types", () => {
  const event = {
    created: 1_793_692_800,
    data: {
      object: {
        amount: 100,
        amount_captured: 100,
        amount_refunded: 0,
        captured: true,
        currency: "usd",
        id: "ch_proof",
        metadata: { checkoutId: "checkout_proof" },
        object: "charge",
        paid: true,
        status: "succeeded",
      },
    },
    id: "evt_proof",
    type: "charge.succeeded",
  };
  assert.equal(validates("StripeWebhookRequest", event), true);
  for (const field of [
    "amount",
    "amount_total",
    "amount_received",
    "amount_capturable",
    "amount_captured",
    "amount_refunded",
  ]) {
    for (const value of [
      null,
      true,
      "100",
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.equal(
        validates("StripeWebhookRequest", {
          ...event,
          data: { object: { ...event.data.object, [field]: value } },
        }),
        false,
        field
      );
    }
  }
  for (const field of ["paid", "captured"]) {
    for (const value of [null, 0, "true"]) {
      assert.equal(
        validates("StripeWebhookRequest", {
          ...event,
          data: { object: { ...event.data.object, [field]: value } },
        }),
        false,
        field
      );
    }
  }
  for (const [field, value] of [
    ["id", null],
    ["object", false],
    ["status", null],
    ["mode", true],
    ["payment_status", 1],
    ["currency", "US"],
    ["metadata", []],
    ["client_reference_id", true],
  ]) {
    assert.equal(
      validates("StripeWebhookRequest", {
        ...event,
        data: { object: { ...event.data.object, [field]: value } },
      }),
      false,
      field
    );
  }
  assert.equal(
    validates("StripeWebhookRequest", {
      ...event,
      data: { object: { ...event.data.object, client_reference_id: null } },
    }),
    true
  );
});
