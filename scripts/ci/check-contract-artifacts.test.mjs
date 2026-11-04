import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const indexPath = "docs/contracts/platform-points/generated-index.json";
const constantPath = "server/application/platform/contract-version.ts";
function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), "contract-drift-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  for (const file of [indexPath, ...Object.keys(index.artifacts)]) {
    const target = resolve(root, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(file, target);
  }
  const check = () =>
    spawnSync(
      process.execPath,
      ["scripts/ci/check-contract-artifacts.mjs", `--root=${root}`],
      { encoding: "utf8" }
    );
  assert.equal(check().status, 0);
  return { check, index, root };
}

test("single-repo check rejects edited generated constants and source", (t) => {
  const { root, check } = fixture(t);
  writeFileSync(resolve(root, constantPath), "// changed\n");
  assert.equal(check().status, 1);
  const sourcePath = resolve(
    root,
    "docs/contracts/platform-points/source.json"
  );
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  source.definitions.ExecutionPermit.required = [];
  writeFileSync(sourcePath, JSON.stringify(source));
  assert.match(check().stdout, /SOURCE_DRIFT/);
});

test("single-repo check rejects removed index entries, not just bad hashes", (t) => {
  const { root, index, check } = fixture(t);
  delete index.artifacts[constantPath];
  writeFileSync(resolve(root, indexPath), JSON.stringify(index));
  assert.equal(check().status, 1);
  assert.match(check().stdout, /ARTIFACT_INVENTORY_DRIFT/);
});
