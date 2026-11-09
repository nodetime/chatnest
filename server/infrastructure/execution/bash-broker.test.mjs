import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { request } from "node:http";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBroker } from "./bash-broker.mjs";

const TOKEN = "test-token-".repeat(4);
const result = {
  exitCode: 0,
  files: { "out.csv": "a\n1\n" },
  status: "completed",
  stderr: "",
  stdout: "ok",
};

function fakeDocker(
  onStart = (child) => child.finish(JSON.stringify(result)),
  onOther = () => false
) {
  const calls = [];
  const spawnProcess = (binary, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.input = "";
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        child.input += chunk.toString();
        callback();
      },
    });
    child.kill = () => {
      child.finish("", 137);
      return true;
    };
    let done = false;
    child.finish = (stdout = "", code = 0, stderr = "") => {
      if (done) {
        return;
      }
      done = true;
      child.stdout.end(stdout);
      child.stderr.end(stderr);
      child.emit("close", code);
    };
    calls.push({ args, binary, child, options });
    queueMicrotask(() => {
      if (args[0] === "exec") {
        child.stdin.once("finish", () => onStart(child));
      } else if (!onOther?.(child, args)) {
        child.finish(args[0] === "create" ? "container-id\n" : "");
      }
    });
    return child;
  };
  return { calls, spawnProcess };
}

async function fixture(t, docker, extra = {}) {
  const broker = createBroker({
    image: "fixture-image:fixed",
    spawnProcess: docker.spawnProcess,
    token: TOKEN,
    ...extra,
  });
  await new Promise((resolve) => broker.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${broker.server.address().port}`;
  t.after(() =>
    broker.shutdown().catch((error) => {
      if (!extra.expectCleanupFailure) {
        throw error;
      }
    })
  );
  const execute = (body, token = TOKEN) =>
    fetch(`${base}/execute`, {
      body: JSON.stringify({
        leaseId: randomUUID(),
        sessionId: randomUUID().replaceAll("-", "").repeat(2),
        ...body,
      }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
  return { ...broker, base, execute };
}

async function waitFor(predicate, attempts = 1000) {
  if (predicate()) {
    return;
  }
  assert.ok(
    attempts > 0,
    "Expected subprocess lifecycle event did not arrive."
  );
  await new Promise((resolve) => setImmediate(resolve));
  await waitFor(predicate, attempts - 1);
}

test("configuration and authentication reject missing or incorrect credentials", async (t) => {
  assert.throws(() => createBroker({ image: "image", token: "short" }));
  assert.throws(() => createBroker({ token: TOKEN }));
  const docker = fakeDocker();
  const app = await fixture(t, docker);
  assert.equal((await fetch(`${app.base}/health`)).status, 200);
  assert.equal(
    (await app.execute({ command: "true", files: {} }, "wrong")).status,
    401
  );
  assert.equal(docker.calls.length, 0);
});

test("fixed Docker isolation parameters and stdin keep input outside Docker arguments", async (t) => {
  const docker = fakeDocker();
  const app = await fixture(t, docker);
  const payload = {
    command: "printf 'MODEL_COMMAND'",
    files: { "input.json": "[]" },
  };
  const response = await app.execute(payload);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  const create = docker.calls.find((call) => call.args[0] === "create");
  assert.equal(create.binary, "docker");
  for (const value of [
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "no-new-privileges",
    "65532:65532",
    "256m",
    "0.5",
    "64",
    "python3",
    "-I",
  ]) {
    assert.ok(create.args.includes(value), value);
  }
  assert.ok(!create.args.some((arg) => arg.includes("MODEL_COMMAND")));
  assert.deepEqual(
    JSON.parse(
      docker.calls.find((call) => call.args[0] === "exec").child.input
    ),
    payload
  );
  assert.equal(
    docker.calls.filter((call) => call.args[0] === "rm").length,
    0,
    "successful command retains its conversation environment"
  );
  assert.deepEqual(Object.keys(create.options.env).sort(), ["PATH"]);
});

test("validation rejects traversal, invalid shapes and file budgets before Docker", async (t) => {
  const docker = fakeDocker();
  const app = await fixture(t, docker);
  for (const files of [
    { "../x": "x" },
    { "/x": "x" },
    { "a\\b": "x" },
    { "./x": "x" },
    { "a//b": "x" },
    { ["x".repeat(241)]: "x" },
    { "control\u007f": "x" },
    { x: 1 },
    { x: "x".repeat(4 * 1024 * 1024 + 1) },
    Object.fromEntries(
      ["a", "b", "c", "d"].map((path) => [
        path,
        "x".repeat(3 * 1024 * 1024 + 1),
      ])
    ),
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: Sequential requests avoid exercising the separate two-request admission limit.
    assert.equal((await app.execute({ command: "true", files })).status, 400);
  }
  assert.equal(
    (await app.execute({ command: "x".repeat(32_001), files: {} })).status,
    400
  );
  assert.equal(docker.calls.length, 0);
});

test("only two requests enter Docker and failed Docker exit is explicit", async (t) => {
  const running = [];
  const docker = fakeDocker((child) => running.push(child));
  const app = await fixture(t, docker);
  const first = app.execute({ command: "true", files: {} });
  const second = app.execute({ command: "true", files: {} });
  await waitFor(() => running.length === 2);
  assert.equal((await app.execute({ command: "true", files: {} })).status, 429);
  running[0].finish("", 125, "private daemon detail");
  running[1].finish(JSON.stringify(result));
  const failed = await (await first).json();
  assert.equal(failed.status, "failed");
  assert.equal(failed.files && Object.keys(failed.files).length, 0);
  assert.ok(!JSON.stringify(failed).includes("private daemon detail"));
  assert.equal((await second).status, 200);
});

test("deadline and client disconnect remove the whole container", async (t) => {
  const docker = fakeDocker(() => {
    /* Hold execution until the broker cancels it. */
  });
  const app = await fixture(t, docker, { deadlineMs: 40 });
  const response = await app.execute({ command: "true", files: {} });
  assert.equal((await response.json()).status, "failed");
  assert.ok(docker.calls.some((call) => call.args[0] === "rm"));
  const before = docker.calls.filter((call) => call.args[0] === "rm").length;
  const req = request(`${app.base}/execute`, {
    headers: { authorization: `Bearer ${TOKEN}` },
    method: "POST",
  });
  req.on("error", () => {
    /* A destroyed request intentionally raises a socket error. */
  });
  req.end(
    JSON.stringify({
      command: "true",
      files: {},
      leaseId: randomUUID(),
      sessionId: "d".repeat(64),
    })
  );
  await waitFor(
    () => docker.calls.filter((call) => call.args[0] === "exec").length === 2
  );
  req.destroy();
  await waitFor(
    () => docker.calls.filter((call) => call.args[0] === "rm").length > before
  );
});

test("oversized or invalid runner responses are failed and containers are removed", async (t) => {
  for (const output of [
    "not json",
    "x".repeat(16 * 1024 * 1024 + 1),
    JSON.stringify({ ...result, files: { "../out": "bad" } }),
  ]) {
    const docker = fakeDocker((child) => child.finish(output));
    // biome-ignore lint/performance/noAwaitInLoops: Each invalid response gets a fresh service with isolated admission state.
    const app = await fixture(t, docker);
    assert.equal(
      (await (await app.execute({ command: "true", files: {} })).json()).status,
      "failed"
    );
    assert.ok(docker.calls.some((call) => call.args[0] === "rm"));
  }
});

test("orphan cleanup selects only the configured service instance", async (t) => {
  const docker = fakeDocker();
  const app = await fixture(t, docker);
  await app.cleanupOrphans();
  const listing = docker.calls.find((call) => call.args[0] === "ps");
  assert.ok(
    listing.args.includes(
      "label=chatnest.execution.instance=chatnest-execution"
    )
  );
});

test("shutdown removes active containers and rejects later execution", async (t) => {
  const running = [];
  const docker = fakeDocker((child) => running.push(child));
  const app = await fixture(t, docker);
  const response = app.execute({ command: "true", files: {} });
  await waitFor(() => running.length > 0);
  await app.shutdown();
  await response.catch(() => {
    /* Shutdown may close the response socket. */
  });
  assert.ok(docker.calls.some((call) => call.args[0] === "rm"));
});

test("an oversized body is rejected before any Docker call", async (t) => {
  const docker = fakeDocker();
  const app = await fixture(t, docker);
  const response = await app.execute({
    command: "true",
    files: { huge: "x".repeat(16 * 1024 * 1024) },
  });
  assert.equal(response.status, 413);
  assert.equal(docker.calls.length, 0);
});

test("an incomplete upload times out and releases admission without starting Docker", async (t) => {
  const docker = fakeDocker();
  const app = await fixture(t, docker, { deadlineMs: 40 });
  const req = request(`${app.base}/execute`, {
    headers: { authorization: `Bearer ${TOKEN}`, "content-length": "1000" },
    method: "POST",
  });
  req.on("error", () => {
    /* The upload deadline closes this incomplete request. */
  });
  const closed = new Promise((resolve) => req.once("close", resolve));
  req.write("{");
  await closed;
  assert.equal(docker.calls.length, 0);
  assert.equal((await app.execute({ command: "true", files: {} })).status, 200);
});

test("a container that cannot be removed stops further admission", async (t) => {
  const docker = fakeDocker(
    (child) => child.finish("invalid json"),
    (child, args) => {
      if (args[0] === "rm") {
        child.finish("", 1);
        return true;
      }
      if (args[0] === "ps") {
        child.finish("abcdef123456\n");
        return true;
      }
      return false;
    }
  );
  const app = await fixture(t, docker, { expectCleanupFailure: true });
  const output = await (
    await app.execute({ command: "true", files: {} })
  ).json();
  assert.equal(output.status, "failed");
  assert.equal((await fetch(`${app.base}/health`)).status, 503);
  assert.equal((await app.execute({ command: "true", files: {} })).status, 503);
});

test("Python runner only exports successful outputs and rejects links at publication boundaries", () => {
  const runnerPath = fileURLToPath(
    new URL("./bash-runner.py", import.meta.url)
  );
  const script = `import json, runpy, tempfile\nrun = runpy.run_path(${JSON.stringify(runnerPath)})['execute']\ncases = [\n {'command': 'cat input.csv > outputs/output.csv', 'files': {'input.csv':'a\\n1\\n'}},\n {'command': 'ln -s /etc/passwd outputs/link', 'files': {}},\n {'command': 'ln input.csv outputs/alias.csv', 'files': {'input.csv':'a'}},\n {'command': "python3 -c 'print(\\"x\\"*20000)'", 'files': {}},\n {'command': "printf '\\\\377' > outputs/binary", 'files': {}},\n {'command': 'exit 7', 'files': {'keep.txt':'retained'}}\n]\nfor payload in cases:\n with tempfile.TemporaryDirectory() as workspace:\n  print(json.dumps(run(payload, workspace)))\n`;
  const child = spawnSync("python3", ["-I", "-c", script], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(child.status, 0, child.stderr);
  const outputs = child.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(outputs[0].status, "completed");
  assert.equal(outputs[0].files["outputs/output.csv"], "a\n1\n");
  for (const value of [outputs[1], outputs[2], outputs[4], outputs[5]]) {
    assert.equal(value.status, "failed");
  }
  assert.equal(outputs[5].exitCode, 7);
  assert.deepEqual(outputs[5].files, {});
  assert.equal(outputs[3].status, "completed");
  assert.equal(outputs[3].stdoutBytes, 20_001);
});

test("runner enforces its own deadline even when the broker is gone or command pipes are closed", () => {
  const runnerPath = fileURLToPath(
    new URL("./bash-runner.py", import.meta.url)
  );
  const script = `import json, runpy, tempfile\nrun = runpy.run_path(${JSON.stringify(runnerPath)})['execute']\nfor command in ['sleep 5', 'exec 1>&- 2>&-; sleep 5']:\n with tempfile.TemporaryDirectory() as workspace:\n  print(json.dumps(run({'command':command,'files':{}}, workspace, timeout_seconds=0.1)))\n`;
  const child = spawnSync("python3", ["-I", "-c", script], {
    encoding: "utf8",
    timeout: 3000,
  });
  assert.equal(child.status, 0, child.stderr);
  const outputs = child.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(outputs.length, 2);
  for (const output of outputs) {
    assert.equal(output.status, "failed");
    assert.match(output.error, /execution deadline/);
    assert.deepEqual(output.files, {});
  }
});

test("runner distinguishes a specific oversized file from excess file count", () => {
  const runnerPath = fileURLToPath(
    new URL("./bash-runner.py", import.meta.url)
  );
  const script = `import json, runpy, tempfile\nrun = runpy.run_path(${JSON.stringify(runnerPath)})['execute']\ncommands = [\n "python3 -c \\"open('outputs/rec.json','w').write('x'*4194305)\\"",\n "python3 -c \\"[open('outputs/'+str(i)+'.txt','w').write('x') for i in range(65)]\\""\n]\nfor command in commands:\n with tempfile.TemporaryDirectory() as workspace:\n  print(json.dumps(run({'command':command,'files':{}}, workspace)))\n`;
  const child = spawnSync("python3", ["-I", "-c", script], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(child.status, 0, child.stderr);
  const outputs = child.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(outputs[0].status, "failed");
  assert.match(outputs[0].error, /rec\.json.*4194305.*4194304/);
  assert.equal(outputs[1].status, "failed");
  assert.match(outputs[1].error, /64 files/);
});

test("persistent runner retains temporary files and spools large output without exporting the whole workspace", () => {
  const runnerPath = fileURLToPath(
    new URL("./bash-runner.py", import.meta.url)
  );
  const script = `import json, runpy, tempfile\nrun = runpy.run_path(${JSON.stringify(runnerPath)})['execute']\nwith tempfile.TemporaryDirectory() as workspace:\n first = run({'command': "python3 -c \\"open('rec.json','w').write('x'*600000);print('y'*20000)\\"", 'files':{}}, workspace)\n second = run({'command': "wc -c rec.json; head -c 3 " + first.get('stdoutFile','missing'), 'files':{}}, workspace)\n print(json.dumps([first, second]))\n`;
  const child = spawnSync("python3", ["-I", "-c", script], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(child.status, 0, child.stderr);
  const [first, second] = JSON.parse(child.stdout);
  assert.equal(first.status, "completed");
  assert.equal(first.stdoutBytes, 20_001);
  assert.equal(first.stdoutTruncated, true);
  assert.equal(first.files["rec.json"], undefined);
  assert.equal(second.status, "completed");
  assert.match(second.stdout, /600000 rec.json/);
  assert.match(second.stdout, /yyy/);
});

test("one conversation reuses its environment; lease protects execution through publication", async (t) => {
  const docker = fakeDocker();
  const app = await fixture(t, docker);
  const sessionId = "b".repeat(64);
  const leaseId = randomUUID();
  const payload = { command: "true", files: {}, leaseId, sessionId };
  assert.equal((await (await app.execute(payload)).json()).status, "completed");
  assert.match(
    (await (await app.execute({ ...payload, leaseId: randomUUID() })).json())
      .error,
    /busy/
  );
  const release = (id) =>
    fetch(`${app.base}/release`, {
      body: JSON.stringify({ leaseId: id, sessionId }),
      headers: { authorization: `Bearer ${TOKEN}` },
      method: "POST",
    });
  await release(randomUUID());
  assert.match((await (await app.execute(payload)).json()).error, /busy/);
  await release(leaseId);
  assert.equal(
    (await (await app.execute({ ...payload, leaseId: randomUUID() })).json())
      .status,
    "completed"
  );
  assert.equal(
    docker.calls.filter((call) => call.args[0] === "create").length,
    1
  );
  assert.equal(
    docker.calls.filter((call) => call.args[0] === "exec").length,
    2
  );
  assert.equal(docker.calls.filter((call) => call.args[0] === "rm").length, 0);
});

test("runner resets unconfirmed outputs, preserves temporary state, and refreshes source inputs", () => {
  const runnerPath = fileURLToPath(
    new URL("./bash-runner.py", import.meta.url)
  );
  const script = `import json, runpy, tempfile\nrun = runpy.run_path(${JSON.stringify(runnerPath)})['execute']\nwith tempfile.TemporaryDirectory() as workspace:\n first = run({'command': 'echo draft > outputs/leak.csv; echo keep > temporary; false', 'files':{}}, workspace)\n second = run({'command': 'cat temporary; cat sources/call.json', 'files':{'sources/call.json':'original'}}, workspace)\n third = run({'command': 'cat sources/call.json', 'files':{'sources/call.json':'updated'}}, workspace)\n print(json.dumps([first,second,third]))\n`;
  const child = spawnSync("python3", ["-I", "-c", script], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(child.status, 0, child.stderr);
  const [first, second, third] = JSON.parse(child.stdout);
  assert.equal(first.status, "failed");
  assert.equal(second.status, "completed");
  assert.deepEqual(second.files, {});
  assert.match(second.stdout, /keep\noriginal/);
  assert.equal(third.stdout, "updated");
});

test("concurrent acquisition cannot fork one conversation during capacity eviction", async (t) => {
  let removal;
  const docker = fakeDocker(undefined, (child, args) => {
    if (args[0] === "rm" && !removal) {
      removal = child;
      return true;
    }
    return false;
  });
  const app = await fixture(t, docker, { maxSessions: 1 });
  const seed = {
    command: "true",
    files: {},
    leaseId: randomUUID(),
    sessionId: "c".repeat(64),
  };
  await app.execute(seed);
  await fetch(`${app.base}/release`, {
    body: JSON.stringify({ leaseId: seed.leaseId, sessionId: seed.sessionId }),
    headers: { authorization: `Bearer ${TOKEN}` },
    method: "POST",
  });
  const next = { command: "true", files: {}, sessionId: "e".repeat(64) };
  const first = app.execute(next);
  await waitFor(() => removal);
  const second = app.execute(next);
  removal.finish();
  const outcomes = await Promise.all(
    [first, second].map(async (pending) => (await pending).json())
  );
  assert.equal(
    outcomes.filter((value) => value.status === "completed").length,
    1
  );
  assert.equal(
    docker.calls.filter((call) => call.args[0] === "create").length,
    2
  );
});

test("lease release remains available while both command slots are occupied", async (t) => {
  const pending = [];
  let hold = false;
  const docker = fakeDocker((child) =>
    hold ? pending.push(child) : child.finish(JSON.stringify(result))
  );
  const app = await fixture(t, docker);
  const seed = {
    command: "true",
    files: {},
    leaseId: randomUUID(),
    sessionId: "f".repeat(64),
  };
  await app.execute(seed);
  hold = true;
  const commands = [
    app.execute({ command: "true", files: {} }),
    app.execute({ command: "true", files: {} }),
  ];
  await waitFor(() => pending.length === 2);
  const release = await fetch(`${app.base}/release`, {
    body: JSON.stringify({ leaseId: seed.leaseId, sessionId: seed.sessionId }),
    headers: { authorization: `Bearer ${TOKEN}` },
    method: "POST",
  });
  assert.equal(release.status, 200);
  for (const child of pending) {
    child.finish(JSON.stringify(result));
  }
  await Promise.all(commands);
});
