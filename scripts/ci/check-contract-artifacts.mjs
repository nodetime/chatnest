import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const root = resolve(
  process.argv.find((arg) => arg.startsWith("--root="))?.slice(7) ?? "."
);
const directory = resolve(root, "docs/contracts/platform-points");
const readJson = async (file) =>
  JSON.parse(await readFile(resolve(directory, file), "utf8"));
const [index, source, manifest] = await Promise.all([
  readJson("generated-index.json"),
  readJson("source.json"),
  readJson("manifest.json"),
]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const failures = [];
if (hash(JSON.stringify({ manifest, source })) !== index.sourceDigest) {
  failures.push("SOURCE_DRIFT");
}
const layouts = {
  chatnest: [
    "server/application/platform/contract-version.ts",
    "server/application/platform/generated",
    "scripts/ci/check-contract-artifacts.mjs",
  ],
  payload: [
    "apps/server/src/billing/contractVersion.ts",
    "apps/server/src/billing/generated",
    "scripts/check-contract-artifacts.mjs",
  ],
  porta: [
    "apps/server/src/config/contract-version.ts",
    "apps/server/src/billing/generated",
    "scripts/check-contract-artifacts.mjs",
  ],
};
const layout = layouts[index.target];
if (!layout) {
  throw new Error("INVALID_ARTIFACT_TARGET");
}
const [version, generated, checker] = layout;
const docs = "docs/contracts/platform-points";
const expected = [
  version,
  checker,
  ...[
    "openapi.yaml",
    "source.json",
    "manifest.json",
    "contract.schema.json",
  ].map((file) => `${docs}/${file}`),
  ...source.fixtures.map((file) => `${docs}/fixtures/${file}`),
  ...Object.keys(source.publishedSchemas).map(
    (file) => `${docs}/schemas/${file}`
  ),
  ...["schemas", "types", "signatures", "routes", "wire"].map(
    (file) => `${generated}/${file}.ts`
  ),
  ...(index.target === "chatnest"
    ? ["scripts/generated/payment-recovery-schema.mjs"]
    : []),
  ...(index.target === "porta"
    ? ["packages/core/src/generated/platform-contract.ts"]
    : []),
].sort();
if (
  JSON.stringify(expected) !==
  JSON.stringify(Object.keys(index.artifacts).sort())
) {
  failures.push("ARTIFACT_INVENTORY_DRIFT");
}
await Promise.all(
  Object.entries(index.artifacts).map(async ([relative, digest]) => {
    const path = resolve(root, relative);
    if (!path.startsWith(`${root}${sep}`)) {
      throw new Error("INVALID_ARTIFACT_PATH");
    }
    try {
      if (hash(await readFile(path)) !== digest) {
        failures.push(relative);
      }
    } catch {
      failures.push(relative);
    }
  })
);
failures.sort();
console.log(
  JSON.stringify({
    artifactCount: Object.keys(index.artifacts).length,
    failures,
    ok: failures.length === 0,
  })
);
if (failures.length) {
  process.exitCode = 1;
}
