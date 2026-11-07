// biome-ignore-all lint/performance/noAwaitInLoops: Sequential owned processes bound resource use and allow deterministic cleanup checks.
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatContract } from "./contract-formatter.mjs";

async function fixture(t, program) {
  const root = await mkdtemp(join(tmpdir(), "contract-formatter-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const biome = join(root, "node_modules/@biomejs/biome");
  const prettier = join(root, "apps/server/node_modules/prettier/bin");
  await mkdir(biome, { recursive: true });
  await mkdir(prettier, { recursive: true });
  await writeFile(join(root, "package.json"), "{}");
  await writeFile(join(biome, "package.json"), '{"name":"@biomejs/biome"}');
  await writeFile(join(biome, "biome.cjs"), program);
  // Same supported subpath used by the production generator, not a new resolver.
  await mkdir(join(biome, "bin"));
  await writeFile(join(biome, "bin/biome"), program);
  await writeFile(join(prettier, "prettier.cjs"), program);
  return realpath(root);
}

test("formatter preserves stdin, cwd, exact formatter arguments and stdout for both repositories", async (t) => {
  const root = await fixture(
    t,
    `let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({input,cwd:process.cwd(),args:process.argv.slice(2)})));`
  );
  for (const payload of [false, true]) {
    const relative = "generated/schema.ts";
    const result = JSON.parse(
      await formatContract("中文\n", root, relative, payload)
    );
    assert.deepEqual(result, {
      args: payload
        ? ["--stdin-filepath", relative]
        : ["check", "--write", `--stdin-file-path=${relative}`],
      cwd: payload ? join(root, "apps/server") : root,
      input: "中文\n",
    });
  }
});

test("formatter nonzero exit fails once with the target path instead of returning partial stdout", async (t) => {
  const root = await fixture(
    t,
    `require('node:fs').appendFileSync('attempts','1');process.stdout.write('partial');process.stderr.write('synthetic failure');process.exit(7);`
  );
  await assert.rejects(
    () => formatContract("input", root, "bad.json"),
    /GENERATED_FORMAT_FAILED:bad.json:synthetic failure/
  );
  assert.equal(await readFile(join(root, "attempts"), "utf8"), "1");
});

test("formatter total timeout kills the exact hanging child even when SIGTERM is ignored, without retry", {
  timeout: 10_000,
}, async (t) => {
  const root = await fixture(
    t,
    `require('node:fs').appendFileSync('attempts','1');require('node:fs').writeFileSync('child.pid',String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`
  );
  const start = performance.now();
  await assert.rejects(
    () =>
      formatContract("input", root, "hang.json", false, { timeoutMs: 2000 }),
    /GENERATED_FORMAT_TIMEOUT:hang.json/
  );
  assert.ok(performance.now() - start < 8000);
  assert.equal(await readFile(join(root, "attempts"), "utf8"), "1");
  const pid = Number(await readFile(join(root, "child.pid"), "utf8"));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("formatter output limit fails closed and does not retry", async (t) => {
  const root = await fixture(
    t,
    `require('node:fs').appendFileSync('attempts','1');process.stdout.write('x'.repeat(8192));`
  );
  await assert.rejects(
    () =>
      formatContract("input", root, "huge.json", false, { maxBuffer: 1024 }),
    /GENERATED_FORMAT_OUTPUT_LIMIT:huge.json/
  );
  assert.equal(await readFile(join(root, "attempts"), "utf8"), "1");
});

test("formatter timeout also terminates the owned Biome-style native descendant", {
  timeout: 10_000,
}, async (t) => {
  const root = await fixture(
    t,
    `const inner="require('node:fs').writeFileSync('grandchild.pid',String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);";require('node:child_process').spawnSync(process.execPath,['-e',inner],{stdio:'inherit'});`
  );
  let descendantPid;
  t.after(() => {
    try {
      if (descendantPid) {
        process.kill(descendantPid, "SIGKILL");
      }
    } catch (error) {
      if (!["ENOENT", "ESRCH"].includes(error.code)) {
        throw error;
      }
    }
  });
  await assert.rejects(
    () =>
      formatContract("input", root, "nested.json", false, { timeoutMs: 2000 }),
    /GENERATED_FORMAT_TIMEOUT:nested.json/
  );
  descendantPid = Number(await readFile(join(root, "grandchild.pid"), "utf8"));
  const pid = descendantPid;
  // Grandchildren may be reaped asynchronously after the group is terminated.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") {
        return;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`owned formatter descendant still exists: ${pid}`);
});

test("formatter rejects disabled or nonfinite limits before launching a process", async () => {
  for (const options of [
    { timeoutMs: 0 },
    { timeoutMs: Number.POSITIVE_INFINITY },
    { maxBuffer: 0 },
    { maxBuffer: -1 },
  ]) {
    await assert.rejects(
      () =>
        formatContract("input", "/nonexistent", "limits.json", false, options),
      /GENERATED_FORMAT_LIMITS_INVALID:limits.json/
    );
  }
});

test("formatter rejects a partial stdin write even if the child exits zero with output", async (t) => {
  const root = await fixture(
    t,
    `require('node:fs').closeSync(0);process.stdout.write('partial');setTimeout(()=>process.exit(0),50);`
  );
  await assert.rejects(
    () => formatContract("x".repeat(2 * 1024 * 1024), root, "partial.json"),
    /GENERATED_FORMAT_INPUT_FAILED:partial.json/
  );
});

test("formatter output budget counts stdout and stderr together", async (t) => {
  const root = await fixture(
    t,
    `process.stdout.write('x'.repeat(900));process.stderr.write('y'.repeat(900));`
  );
  await assert.rejects(
    () =>
      formatContract("input", root, "combined.json", false, {
        maxBuffer: 1024,
      }),
    /GENERATED_FORMAT_OUTPUT_LIMIT:combined.json/
  );
});
