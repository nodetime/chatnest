import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./release-gate.mjs", import.meta.url);

test("release gate accepts the checked-in deployment contract", () => {
  const result = spawnSync(
    process.execPath,
    [script.pathname, `--root=${process.cwd()}`],
    {
      encoding: "utf8",
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.failureCount, 0);
  assert.equal(output.checkCount, 48);
});

test("release gate fails closed when a deployment contract is missing", (t) => {
  const root = mkdtempSync(join(tmpdir(), "chatnest-release-gate-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  for (const directory of [
    "deploy",
    "scripts/ci",
    "scripts",
    "server/infrastructure/persistence/drizzle",
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const relative of [
    "package.json",
    "deploy/settlement-worker.service",
    "deploy/settlement-worker.timer",
    "deploy/settlement-worker.env.example",
    "deploy/release-checklist.md",
    "scripts/ci/production-gate.mjs",
    "scripts/platform-settlement-worker.mjs",
    "scripts/production-acceptance.mjs",
    "scripts/model-gateway-acceptance.mjs",
    "scripts/alert-sink-acceptance.mjs",
    "server/infrastructure/persistence/drizzle/migrate.ts",
  ]) {
    cpSync(join(process.cwd(), relative), join(root, relative));
  }
  unlinkSync(join(root, "deploy/settlement-worker.service"));
  const result = spawnSync(
    process.execPath,
    [script.pathname, `--root=${root}`],
    {
      encoding: "utf8",
    }
  );
  assert.notEqual(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.ok(
    output.failures.includes("MISSING_FILE:deploy/settlement-worker.service")
  );
  assert.match(
    readFileSync(join(root, "deploy/release-checklist.md"), "utf8"),
    /rollback/i
  );
});
