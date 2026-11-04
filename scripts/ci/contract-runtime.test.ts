import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  ExecutionPermitSchema,
  ExecutionReceiptSchema,
} from "../../server/application/platform/generated/schemas";

const chatnestSchemas = { ExecutionPermitSchema, ExecutionReceiptSchema };

// Explicit three-checkout acceptance. Never included in standalone offline CI.
const payloadRoot =
  process.env.PAYLOAD_ROOT ?? resolve("../../NexaZ/heymoro-starter");
const portaRoot = process.env.PORTA_ROOT ?? resolve("../porta");
async function moduleAt(root: string, path: string) {
  const loaded = await import(pathToFileURL(resolve(root, path)).href);
  return loaded.default ?? loaded;
}
const json = (path: string) =>
  JSON.parse(
    readFileSync(resolve("docs/contracts/platform-points", path), "utf8")
  );

function keys() {
  return generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
}

test("Payload signs a real permit verified by Porta, Porta signs a receipt verified by Payload", async (t) => {
  const payload = await moduleAt(
    payloadRoot,
    "apps/server/src/billing/executionSecurity.ts"
  );
  const porta = await moduleAt(portaRoot, "apps/server/src/billing/points.ts");
  const platformKey = keys();
  const receiptKey = keys();
  const env = {
    PAYLOAD_PLATFORM_KEY_ID: "contract-acceptance-platform",
    PAYLOAD_PLATFORM_PRIVATE_KEY: platformKey.privateKey,
    PORTA_RECEIPT_KEY_ID: "contract-acceptance-porta",
    PORTA_RECEIPT_PUBLIC_KEYS_JSON: JSON.stringify({
      "contract-acceptance-porta": receiptKey.publicKey,
    }),
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]])
  );
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
  Object.assign(process.env, env);
  const operation = {
    attemptId: "contract-attempt",
    canonicalToolKey: "fixture/local.tool",
    chargeMode: "charge_on_success",
    operationId: "contract-operation",
    priceVersion: "fixture-price",
    reservedPoints: "2.000000",
  };
  const permit = JSON.parse(
    Buffer.from(payload.createPermit(operation), "base64url").toString("utf8")
  );
  const trusted = { "contract-acceptance-platform": platformKey.publicKey };
  const options = {
    expectedAttemptId: operation.attemptId,
    expectedToolKey: operation.canonicalToolKey,
  };
  assert.equal(
    porta.verifyExecutionPermit(permit, trusted, options).operationId,
    operation.operationId
  );
  assert.throws(
    () =>
      porta.verifyExecutionPermit(
        { ...permit, reservedPoints: "3" },
        trusted,
        options
      ),
    /signature/
  );
  const receipt = porta.signExecutionReceipt(
    {
      attemptId: operation.attemptId,
      canonicalToolKey: operation.canonicalToolKey,
      dispatchEvidence: "response",
      httpStatus: 200,
      operationId: operation.operationId,
      outcome: "response",
      receiptId: "contract-receipt",
      receiptRevision: 1,
      supplierUnits: { requests: "1" },
    },
    receiptKey.privateKey
  );
  assert.equal(payload.verifyReceipt(operation, receipt), true);
  assert.throws(
    () =>
      payload.verifyReceipt(operation, {
        ...receipt,
        supplierUnits: { requests: "2" },
      }),
    /SIGNATURE/
  );
  assert.throws(
    () => payload.verifyReceipt(operation, { ...receipt, httpStatus: 99 }),
    /SCHEMA/
  );
  assert.throws(
    () => payload.verifyReceipt(operation, { ...receipt, keyId: "injected" }),
    /SCHEMA/
  );
});

test("actual three-repo validators agree with independently compiled published JSON schemas", async () => {
  const payload = await moduleAt(
    payloadRoot,
    "apps/server/src/billing/generated/schemas.ts"
  );
  const porta = await moduleAt(
    portaRoot,
    "apps/server/src/billing/generated/schemas.ts"
  );
  const tool = json("fixtures/tool-success.json");
  for (const [name, file, valid, invalid] of [
    [
      "ExecutionPermitSchema",
      "permit.json",
      tool.dispatch.permitPayload,
      { ...tool.dispatch.permitPayload, reservedPoints: "1.0000001" },
    ],
    [
      "ExecutionReceiptSchema",
      "receipt.json",
      tool.porta.receipt,
      { ...tool.porta.receipt, dispatchEvidence: undefined },
    ],
  ] as const) {
    const validate = addFormats(
      new Ajv2020({ allowUnionTypes: true, strict: true })
    ).compile(json(`schemas/${file}`));
    for (const [value, expected] of [
      [valid, true],
      [invalid, false],
    ] as const) {
      assert.equal(validate(value), expected);
      for (const runtime of [chatnestSchemas, payload, porta]) {
        assert.equal(runtime[name].safeParse(value).success, expected);
      }
    }
  }
});
