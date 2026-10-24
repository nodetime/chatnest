import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const source = new URL("./offline-checks.sh", import.meta.url);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "chatnest-ci-contract-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, "scripts/ci"), { recursive: true });
  mkdirSync(join(root, "bin"));
  copyFileSync(source, join(root, "scripts/ci/offline-checks.sh"));
  copyFileSync(
    new URL("./offline-tests.txt", import.meta.url),
    join(root, "scripts/ci/offline-tests.txt")
  );
  writeFileSync(
    join(root, "bin/pnpm"),
    `#!${process.execPath}\nconsole.log(JSON.stringify({ args: process.argv.slice(2), env: process.env }));\n`,
    { mode: 0o755 }
  );
  return {
    root,
    run: (mode) =>
      spawnSync("bash", ["scripts/ci/offline-checks.sh", mode], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: "inherited-secret-must-not-pass",
          CI_CONTRACT_SECRET: "must-not-pass",
          NODE_OPTIONS: "--no-warnings",
          OPENAI_API_KEY: "inherited-secret-must-not-pass",
          PATH: `${root}/bin:${process.env.PATH}`,
        },
      }),
  };
}

test("all modes discard inherited credentials and Node injection", (t) => {
  const { run } = fixture(t);
  for (const mode of ["tests", "typecheck", "lint", "build"]) {
    const result = run(mode);
    assert.equal(result.status, 0, result.stderr);
    const { env } = JSON.parse(result.stdout);
    assert.equal(env.CI_CONTRACT_SECRET, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.ok(!Object.values(env).includes("inherited-secret-must-not-pass"));
  }
});

test("build invokes Next directly, never deployment migrations", (t) => {
  const { run } = fixture(t);
  const result = run("build");
  assert.equal(result.status, 0, result.stderr);
  const { args, env } = JSON.parse(result.stdout);
  assert.deepEqual(args, ["exec", "next", "build", "--webpack"]);
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.OPENAI_BASE_URL, "http://127.0.0.1:9/v1");
  assert.equal(env.POSTGRES_URL, "postgres://ci:ci@127.0.0.1:9/chatnest_ci");
  assert.equal(env.REDIS_URL, undefined);
});

test("suite is explicit, serial and excludes live browser/database tests", (t) => {
  const { run } = fixture(t);
  const result = run("tests");
  assert.equal(result.status, 0, result.stderr);
  const { args } = JSON.parse(result.stdout);
  assert.ok(args.includes("--test-concurrency=1"));
  assert.ok(args.includes("--conditions=react-server"));
  assert.ok(args.includes("app/_components/chat/runtime-interactions.test.ts"));
  assert.ok(
    !args.some((arg) => /[*?]|browser-runtime|regeneration-db/.test(arg))
  );
  assert.ok(args.filter((arg) => arg.endsWith(".test.ts")).length >= 30);
});

test("local environment files stop checks without reading their content", (t) => {
  const { root, run } = fixture(t);
  writeFileSync(join(root, ".env.example"), "example");
  assert.equal(run("lint").status, 0);
  for (const filename of [".env", ".env.local", ".env.production.local"]) {
    writeFileSync(join(root, filename), "private-content-must-not-be-logged");
    const result = run("build");
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /clean checkout/);
    assert.ok(!result.stderr.includes("private-content"));
    rmSync(join(root, filename));
  }
});

test("unknown modes fail closed", (t) => {
  const { run } = fixture(t);
  assert.notEqual(run("deployment").status, 0);
});

test("workflow has no secrets and enforces OS network isolation after installation", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/offline-checks.yml", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    workflow,
    /secrets\.|pull_request_target|pnpm build|pnpm test/
  );
  assert.match(workflow, /--frozen-lockfile/);
  assert.match(workflow, /linux-isolated-check\.sh/);
  const wrapper = readFileSync(
    new URL("./linux-isolated-check.sh", import.meta.url),
    "utf8"
  );
  assert.match(wrapper, /unshare --net/);
  assert.match(wrapper, /ip link set dev lo up/);
  assert.match(wrapper, /runuser/);
});
