// biome-ignore-all lint/performance/noAwaitInLoops: Preserve ordered single-formatter execution; never fan out hundreds of processes or write partial targets on failure.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderContract } from "./contract-artifacts.mjs";
import { formatContract as format } from "./contract-formatter.mjs";

const chatnestRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const payloadRoot = resolve(chatnestRoot, "../payload");
const portaRoot = process.env.PORTA_ROOT || resolve(chatnestRoot, "../porta");
const manifest = JSON.parse(
  await readFile(
    resolve(chatnestRoot, "docs/contracts/platform-points/manifest.json"),
    "utf8"
  )
);

const sourceText = await readFile(
  resolve(chatnestRoot, "docs/contracts/platform-points/source.json"),
  "utf8"
);
const source = JSON.parse(sourceText);
const schemaFiles = Object.keys(source.publishedSchemas).sort();
const fixtureFiles = [...source.fixtures].sort();
const fixtureContents = await Promise.all(
  fixtureFiles.map(async (file) => {
    const fixture = JSON.parse(
      await readFile(
        resolve(chatnestRoot, "docs/contracts/platform-points/fixtures", file),
        "utf8"
      )
    );
    fixture.schemaRevision = manifest.schemaRevision;
    return [file, `${JSON.stringify(fixture, null, 2)}\n`];
  })
);

if (schemaFiles.length === 0 || fixtureFiles.length === 0) {
  throw new Error("CONTRACT_ARTIFACT_INPUTS_MISSING");
}

const generatedList = (files, quote) =>
  `[\n${files.map((file) => `  ${quote}${file}${quote}`).join(",\n")},\n]`;
const ts = (quote) =>
  `/** Generated from docs/contracts/platform-points/source.json + manifest.json. */\nexport const PLATFORM_API_VERSION = ${quote}${manifest.apiVersion}${quote} as const;\nexport const PLATFORM_SCHEMA_REVISION = ${quote}${manifest.schemaRevision}${quote} as const;\nexport const PLATFORM_POINT_SCALE = ${manifest.pointScale.toString().replace(/\d(?=(\d{3})+$)/g, "$&_")} as const;\nexport const PLATFORM_REQUEST_ID_MAX_LENGTH = ${source.definitions.RequestId.maxLength} as const;\nexport const PLATFORM_CONTRACT_SCHEMA_FILES = ${generatedList(schemaFiles, quote)} as const;\nexport const PLATFORM_CONTRACT_FIXTURE_FILES = ${generatedList(fixtureFiles, quote)} as const;\n`;
const targets = [
  [
    resolve(chatnestRoot, "server/application/platform/contract-version.ts"),
    ts('"'),
  ],
  [
    resolve(payloadRoot, "apps/server/src/billing/contractVersion.ts"),
    ts("'").replaceAll(";", ""),
  ],
  [resolve(portaRoot, "apps/server/src/config/contract-version.ts"), ts('"')],
];

// Content generation is deliberately separate from the legacy version constants.
const artifact = renderContract(source, manifest);
const checker = await readFile(
  resolve(chatnestRoot, "scripts/ci/check-contract-artifacts.mjs"),
  "utf8"
);
const targetArg =
  process.argv.find((arg) => arg.startsWith("--target="))?.slice(9) ?? "all";
if (!["all", "chatnest", "payload", "porta"].includes(targetArg)) {
  throw new Error("INVALID_GENERATION_TARGET");
}
const roots = [
  ["chatnest", chatnestRoot, "server/application/platform/generated"],
  ["payload", payloadRoot, "apps/server/src/billing/generated"],
  ["porta", portaRoot, "apps/server/src/billing/generated"],
];
for (const [name, root, output] of roots) {
  if (targetArg !== "all" && name !== targetArg) {
    continue;
  }
  const constant = targets.find(([path]) => path.startsWith(`${root}/`));
  const constantRelative = constant[0].slice(root.length + 1);
  constant[1] = await format(
    constant[1],
    root,
    constantRelative,
    name === "payload"
  );
  const local = [[constantRelative, constant[1]]];
  const add = async (relative, content) => {
    const formatted = relative.endsWith(".json")
      ? await format(content, root, relative, name === "payload")
      : content;
    local.push([relative, formatted]);
    targets.push([resolve(root, relative), formatted]);
  };
  const docs = "docs/contracts/platform-points";
  await add(`${docs}/openapi.yaml`, artifact.openapi);
  for (const [file, content] of fixtureContents) {
    await add(`${docs}/fixtures/${file}`, content);
  }
  await add(`${docs}/source.json`, sourceText);
  await add(`${docs}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  await add(
    `${docs}/contract.schema.json`,
    `${JSON.stringify(artifact.bundle, null, 2)}\n`
  );
  for (const [file, schema] of Object.entries(artifact.jsonSchemas)) {
    await add(
      `${docs}/schemas/${file}`,
      `${JSON.stringify(schema, null, 2)}\n`
    );
  }
  for (const [file, content] of [
    ["schemas", artifact.validators],
    ["types", artifact.types],
    ["signatures", artifact.signatures],
    ["routes", artifact.routes],
    ["wire", artifact.wire],
  ]) {
    const relative = `${output}/${file}.ts`;
    await add(
      relative,
      await format(
        name === "porta"
          ? content
          : content.replaceAll(
              /from "\.\/(routes|schemas)\.js"/g,
              'from "./$1"'
            ),
        root,
        relative,
        name === "payload"
      )
    );
  }
  if (name === "chatnest") {
    const relative = "scripts/generated/payment-recovery-schema.mjs";
    await add(
      relative,
      await format(artifact.workerValidators, root, relative)
    );
  }
  if (name === "porta") {
    await add(
      "packages/core/src/generated/platform-contract.ts",
      await format(
        artifact.types,
        root,
        "packages/core/src/generated/platform-contract.ts"
      )
    );
  }
  await add(
    name === "chatnest"
      ? "scripts/ci/check-contract-artifacts.mjs"
      : "scripts/check-contract-artifacts.mjs",
    await format(
      checker,
      root,
      name === "chatnest"
        ? "scripts/ci/check-contract-artifacts.mjs"
        : "scripts/check-contract-artifacts.mjs",
      name === "payload"
    )
  );
  const artifacts = Object.fromEntries(
    local.map(([path, content]) => [
      path,
      createHash("sha256").update(content).digest("hex"),
    ])
  );
  await add(
    `${docs}/generated-index.json`,
    `${JSON.stringify({ artifacts, sourceDigest: artifact.digest, target: name }, null, 2)}\n`
  );
}
if (targetArg !== "all") {
  const [, wantedRoot] = roots.find(([name]) => name === targetArg);
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    if (!targets[i][0].startsWith(`${wantedRoot}/`)) {
      targets.splice(i, 1);
    }
  }
}

const check = process.argv.includes("--check");
const observations = await Promise.all(
  targets.map(async ([path, content]) => {
    let current = "";
    try {
      current = await readFile(path, "utf8");
    } catch {
      // Missing generated files are handled as drift in check mode.
    }
    return { content, current, path };
  })
);
const drift = observations
  .filter(({ content, current }) => current !== content)
  .map(({ path }) => path);
if (!check) {
  await Promise.all(
    observations
      .filter(({ content, current }) => current !== content)
      .map(async ({ content, path }) => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
      })
  );
}
if (check && drift.length > 0) {
  console.error(`CONTRACT_CONSTANTS_DRIFT\n${drift.join("\n")}`);
  process.exit(1);
}
console.log(
  JSON.stringify({ check, drift, generated: targets.map(([path]) => path) })
);
