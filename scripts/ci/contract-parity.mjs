import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const chatnestRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const payloadRoot = resolve(chatnestRoot, "../payload");
const portaRoot = process.env.PORTA_ROOT || resolve(chatnestRoot, "../porta");
const manifest = JSON.parse(
  await readFile(
    resolve(chatnestRoot, "docs/contracts/platform-points/manifest.json"),
    "utf8"
  )
);
const receiptSchema = JSON.parse(
  await readFile(
    resolve(
      chatnestRoot,
      "docs/contracts/platform-points/schemas/receipt.json"
    ),
    "utf8"
  )
);

function text(path) {
  return readFile(path, "utf8");
}

function generatedList(source, name) {
  const match = source.match(
    new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as const`)
  );
  if (!match) {
    throw new Error(`GENERATED_LIST_MISSING:${name}`);
  }
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

const openapi = await text(
  resolve(chatnestRoot, "docs/contracts/platform-points/openapi.yaml")
);
const payloadPoints = await text(
  resolve(payloadRoot, "apps/server/src/billing/points.ts")
);
const payloadContractVersion = await text(
  resolve(payloadRoot, "apps/server/src/billing/contractVersion.ts")
);
const payloadExecutionSecurity = await text(
  resolve(payloadRoot, "apps/server/src/billing/executionSecurity.ts")
);
const portaConfig = await text(
  resolve(portaRoot, "apps/server/src/config/index.ts")
);
const portaPoints = await text(
  resolve(portaRoot, "apps/server/src/billing/points.ts")
);
const portaContractVersion = await text(
  resolve(portaRoot, "apps/server/src/config/contract-version.ts")
);
const chatnestContractVersion = await text(
  resolve(chatnestRoot, "server/application/platform/contract-version.ts")
);
const portaDocs = await text(
  resolve(portaRoot, "docs/platform-points-contract.md")
);
const schemaFiles = readdir(
  resolve(chatnestRoot, "docs/contracts/platform-points/schemas")
).then((files) => files.filter((file) => file.endsWith(".json")).sort());
const fixtureFiles = readdir(
  resolve(chatnestRoot, "docs/contracts/platform-points/fixtures")
).then((files) => files.filter((file) => file.endsWith(".json")).sort());
const [expectedSchemaFiles, expectedFixtureFiles] = await Promise.all([
  schemaFiles,
  fixtureFiles,
]);

const receiptOutcomes = [
  "response",
  "timeout",
  "cancelled",
  "network_error",
  "response_too_large",
];
if (!openapi.includes("ExecutionReceipt:")) {
  throw new Error("OPENAPI_RECEIPT_SCHEMA_MISSING");
}
for (const outcome of receiptOutcomes) {
  if (
    !openapi.includes(outcome) ||
    !receiptSchema.properties.outcome.enum.includes(outcome)
  ) {
    throw new Error(`RECEIPT_OUTCOME_DRIFT:${outcome}`);
  }
}
if (
  !portaPoints.includes("executionReceiptSchema") ||
  !receiptSchema.required.includes("supplierUnits") ||
  receiptSchema.required.includes("signature")
) {
  throw new Error("RECEIPT_SCHEMA_RUNTIME_DRIFT");
}

if (!openapi.includes(`version: ${manifest.apiVersion}`)) {
  throw new Error("OPENAPI_API_VERSION_DRIFT");
}
if (!openapi.includes(`x-schema-revision: ${manifest.schemaRevision}`)) {
  throw new Error("OPENAPI_SCHEMA_REVISION_DRIFT");
}
if (!openapi.includes(`x-point-scale: ${manifest.pointScale}`)) {
  throw new Error("OPENAPI_POINT_SCALE_DRIFT");
}
if (!/POINT_SCALE\s*=\s*PLATFORM_POINT_SCALE/.test(payloadPoints)) {
  throw new Error("PAYLOAD_POINT_SCALE_DRIFT");
}
for (const [name, source] of [
  ["CHATNEST", chatnestContractVersion],
  ["PAYLOAD", payloadContractVersion],
  ["PORTA", portaContractVersion],
]) {
  if (
    !source.includes(`PLATFORM_API_VERSION = "${manifest.apiVersion}"`) &&
    !source.includes(`PLATFORM_API_VERSION = '${manifest.apiVersion}'`)
  ) {
    throw new Error(`${name}_API_VERSION_GENERATED_DRIFT`);
  }
  if (!source.includes(manifest.schemaRevision)) {
    throw new Error(`${name}_SCHEMA_REVISION_GENERATED_DRIFT`);
  }
  if (
    !source.includes(
      `PLATFORM_POINT_SCALE = ${manifest.pointScale.toString().replace(/\d(?=(\d{3})+$)/g, "$&_")}`
    )
  ) {
    throw new Error(`${name}_POINT_SCALE_GENERATED_DRIFT`);
  }
}
for (const [name, source] of [
  ["CHATNEST", chatnestContractVersion],
  ["PAYLOAD", payloadContractVersion],
  ["PORTA", portaContractVersion],
]) {
  const actualSchemas = generatedList(source, "PLATFORM_CONTRACT_SCHEMA_FILES");
  const actualFixtures = generatedList(
    source,
    "PLATFORM_CONTRACT_FIXTURE_FILES"
  );
  if (JSON.stringify(actualSchemas) !== JSON.stringify(expectedSchemaFiles)) {
    throw new Error(`${name}_SCHEMA_FILE_LIST_DRIFT`);
  }
  if (JSON.stringify(actualFixtures) !== JSON.stringify(expectedFixtureFiles)) {
    throw new Error(`${name}_FIXTURE_FILE_LIST_DRIFT`);
  }
}
if (
  !/protocolVersion\s*:\s*PLATFORM_API_VERSION/.test(payloadExecutionSecurity)
) {
  throw new Error("PAYLOAD_PROTOCOL_VERSION_DRIFT");
}
if (!/integer\(\s*"POINT_SCALE",\s*PLATFORM_POINT_SCALE/.test(portaConfig)) {
  throw new Error("PORTA_POINT_SCALE_DRIFT");
}
if (!portaDocs.includes(`POINT_SCALE=${manifest.pointScale}`)) {
  throw new Error("PORTA_DOC_POINT_SCALE_DRIFT");
}

console.log(
  JSON.stringify({
    apiVersion: manifest.apiVersion,
    payloadRoot,
    pointScale: manifest.pointScale,
    portaRoot,
    schemaRevision: manifest.schemaRevision,
  })
);
