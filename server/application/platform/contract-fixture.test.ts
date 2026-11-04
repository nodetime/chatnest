import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "docs/contracts/platform-points");
function generatedList(source: string, name: string) {
  const match = source.match(
    new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as const`)
  );
  assert.ok(match, `${name} is missing from generated contract constants`);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

test("platform contract fixtures and OpenAPI keep one schema revision and point scale", async () => {
  const {
    apiVersion,
    pointScale,
    schemaRevision: revision,
  } = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as {
    apiVersion: string;
    pointScale: number;
    schemaRevision: string;
  };
  const fixtureDir = join(root, "fixtures");
  const files = (await readdir(fixtureDir)).filter((file) =>
    file.endsWith(".json")
  );
  assert.ok(files.length >= 5);
  const fixtures = await Promise.all(
    files.map(
      async (file) =>
        [
          file,
          JSON.parse(await readFile(join(fixtureDir, file), "utf8")) as Record<
            string,
            unknown
          >,
        ] as const
    )
  );
  for (const [file, fixture] of fixtures) {
    assert.equal(fixture.schemaRevision, revision, file);
    if (file !== "canonical-json-vectors.json") {
      assert.equal(fixture.apiVersion, apiVersion, file);
    }
  }
  const openapi = await readFile(join(root, "openapi.yaml"), "utf8");
  assert.match(openapi, new RegExp(`version: ${apiVersion}`));
  assert.match(
    openapi,
    new RegExp(`x-schema-revision: ${revision.replaceAll(".", "\\.")}`)
  );
  assert.match(openapi, new RegExp(`x-point-scale: ${pointScale}`));
  assert.match(openapi, /\/payments\/webhook\/\{provider\}/);
  assert.match(openapi, /\/payments\/checkout\/\{checkoutId\}/);
  assert.match(openapi, /\/internal\/payments\/reconcile/);
  assert.match(openapi, /\/internal\/identity\/deactivate/);
  assert.match(openapi, /\/internal\/admin\/capability/);
  assert.match(openapi, /name: limit[\s\S]*maximum: 100/);
  assert.match(openapi, /name: cursor[\s\S]*Opaque cursor/);
  assert.match(openapi, /AdminBillingOverview:/);
  assert.match(openapi, /AdminPaymentAttention:/);
  assert.match(openapi, /paymentAttention:/);
  assert.match(openapi, /ExecutionReceipt:/);
  assert.match(openapi, /network_error/);
  assert.match(openapi, /response_too_large/);
  assert.doesNotMatch(openapi, /\/operations\/\{operationId\}\/cancel/);
});

test("generated contract constants enumerate every schema and fixture", async () => {
  const generated = await readFile(
    join(process.cwd(), "server/application/platform/contract-version.ts"),
    "utf8"
  );
  const [schemaFiles, fixtureFiles] = await Promise.all([
    readdir(join(root, "schemas")).then((files) =>
      files.filter((file) => file.endsWith(".json")).sort()
    ),
    readdir(join(root, "fixtures")).then((files) =>
      files.filter((file) => file.endsWith(".json")).sort()
    ),
  ]);
  assert.deepEqual(
    generatedList(generated, "PLATFORM_CONTRACT_SCHEMA_FILES"),
    schemaFiles
  );
  assert.deepEqual(
    generatedList(generated, "PLATFORM_CONTRACT_FIXTURE_FILES"),
    fixtureFiles
  );
});

test("point-bearing JSON schemas require decimal strings with at most six fractional digits", async () => {
  const schemaDir = join(root, "schemas");
  const files = (await readdir(schemaDir)).filter((file) =>
    file.endsWith(".json")
  );
  const schemas = await Promise.all(
    files.map(
      async (file) =>
        [file, await readFile(join(schemaDir, file), "utf8")] as const
    )
  );
  for (const [file, text] of schemas) {
    if (/Points/.test(text)) {
      assert.match(text, /"type": "string"/, file);
      assert.ok(text.includes("\\\\.[0-9]{1,6}"), file);
    }
  }
});

test("receipt schema matches Porta ExecutionReceipt fields and outcomes", async () => {
  const schema = JSON.parse(
    await readFile(join(root, "schemas/receipt.json"), "utf8")
  ) as {
    required: string[];
    properties: {
      outcome: { enum: string[] };
      httpStatus: { type: string[] };
      supplierUnits: { additionalProperties: { type: string } };
    };
  };
  assert.deepEqual(schema.required, [
    "receiptId",
    "operationId",
    "attemptId",
    "canonicalToolKey",
    "dispatchEvidence",
    "outcome",
    "httpStatus",
    "receiptRevision",
    "supplierUnits",
  ]);
  assert.deepEqual(schema.properties.outcome.enum, [
    "response",
    "timeout",
    "cancelled",
    "network_error",
    "response_too_large",
  ]);
  assert.deepEqual(schema.properties.httpStatus.type, ["integer", "null"]);
  assert.equal(
    schema.properties.supplierUnits.additionalProperties.type,
    "string"
  );
  assert.doesNotMatch(JSON.stringify(schema), /issuedAt|keyId/);
});
