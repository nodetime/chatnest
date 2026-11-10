import assert from "node:assert/strict";
import { test } from "node:test";
import { BashWorkspace } from "./workspace";

const id = "10000000-0000-4000-8000-000000000001";
const document = (content: string, version = 1, userId = "owner") => ({
  content,
  createdAt: new Date(version),
  id,
  kind: "sheet" as const,
  title: "table.csv",
  userId,
});
const completed = (files: Record<string, string>) => ({
  exitCode: 0,
  files,
  status: "completed" as const,
  stderr: "",
  stdout: "done",
});

function setup(
  options: { current?: ReturnType<typeof document>; messages?: any[] } = {}
) {
  let { current } = options;
  const writes: any[] = [];
  const events: any[] = [];
  let result = completed({ "outputs/table.csv": "名称,价格\n台灯,18\n" });
  let inspect = (_input: any) => {
    /* Optional input assertion. */
  };
  const workspace = new BashWorkspace({
    execute: (input) => {
      inspect(input);
      return Promise.resolve(result);
    },
    messages: options.messages ?? [],
    publish: (saved) => {
      events.push(saved);
    },
    release: () => Promise.resolve(),
    repository: {
      findLatestById: () => Promise.resolve(current),
      save: (input: any) => {
        assert.equal(
          input.expectedVersion,
          current?.createdAt.toISOString() ?? null
        );
        assert.equal(input.expectedContent, current?.content ?? null);
        writes.push(input);
        current = {
          ...document(input.content, writes.length + 1),
          id: input.id,
          kind: input.kind,
          title: input.title,
        };
        return Promise.resolve([current]);
      },
    },
    sources: () => ({
      "sources/call.json": JSON.stringify([{ price: 18, title: "台灯" }]),
    }),
    userId: "owner",
  });
  return {
    events,
    inspect: (fn: typeof inspect) => {
      inspect = fn;
    },
    setResult: (value: any) => {
      result = value;
    },
    workspace,
    writes,
  };
}

test("valid CSV preserves blank cells, numeric zero and quoted commas through save and publication", async () => {
  const context = setup();
  const content = '名称,价格,备注\n台灯,,待核对\n水壶,0,"圆形,蓝色"\n';
  context.setResult(completed({ "outputs/table.csv": content }));
  const output = await context.workspace.run("python3 script.py");
  assert.equal(output.status, "completed");
  assert.equal(output.artifacts.length, 1);
  assert.equal(context.writes[0].content, content);
  assert.equal(context.events[0].content, content);
});

test("Bash receives original root-array JSON, saves complete CSV once and publishes only persisted content", async () => {
  const context = setup();
  context.inspect((input) =>
    assert.deepEqual(JSON.parse(input.files["sources/call.json"]), [
      { price: 18, title: "台灯" },
    ])
  );
  const output = await context.workspace.run("python3 script.py");
  assert.equal(output.status, "completed");
  assert.equal(context.writes.length, 1);
  assert.equal(context.writes[0].content, "名称,价格\n台灯,18\n");
  assert.equal(context.writes[0].userId, "owner");
  assert.equal(context.events[0].content, context.writes[0].content);
  assert.equal(output.artifacts.length, 1);
  await context.workspace.run("cat outputs/table.csv");
  assert.equal(
    context.writes.length,
    1,
    "unchanged files do not create versions"
  );
});

test("SVG files save through the native workspace and reopen for an update with the same document identity", async () => {
  const first =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>';
  const second = first.replace('r="30"', 'r="40"');
  const context = setup();
  context.setResult(completed({ "outputs/drawing.svg": first }));
  const output = await context.workspace.run("python3 draw.py");
  assert.equal(output.status, "completed", output.error);
  assert.equal(output.artifacts[0].kind, "code");
  assert.equal(context.writes[0].title, "drawing.svg");
  assert.equal(context.events[0].content, first);
  context.inspect((input) =>
    assert.equal(input.files["outputs/drawing.svg"], first)
  );
  context.setResult(completed({ "outputs/drawing.svg": second }));
  const updated = await context.workspace.run("python3 edit.py");
  assert.equal(updated.status, "completed", updated.error);
  assert.equal(updated.artifacts[0].id, output.artifacts[0].id);
  assert.equal(context.writes[1].expectedContent, first);
  assert.equal(context.events[1].content, second);
});

test("reopened files load the latest owned database content before editing", async () => {
  const context = setup({
    current: document("名称,价格\n用户备注,19\n", 10),
    messages: [
      {
        parts: [
          {
            output: {
              artifacts: [
                {
                  id,
                  kind: "sheet",
                  path: "outputs/table.csv",
                  title: "table.csv",
                },
              ],
            },
            state: "output-available",
            type: "tool-bash",
          },
        ],
        role: "assistant",
      },
    ],
  });
  context.inspect((input) =>
    assert.equal(input.files["outputs/table.csv"], "名称,价格\n用户备注,19\n")
  );
  const result = await context.workspace.run("python3 edit.py");
  assert.equal(result.artifacts[0].id, id);
  assert.equal(context.writes[0].expectedVersion, new Date(10).toISOString());
});

test("foreign documents, invalid output files, command failure and failed saves never publish a success", async () => {
  const foreign = setup({
    current: document("private", 1, "other"),
    messages: [
      {
        parts: [
          {
            output: {
              artifacts: [
                {
                  id,
                  kind: "sheet",
                  path: "outputs/table.csv",
                  title: "table.csv",
                },
              ],
            },
            state: "output-available",
            type: "tool-bash",
          },
        ],
        role: "assistant",
      },
    ],
  });
  assert.equal(
    (await foreign.workspace.run("cat outputs/table.csv")).status,
    "failed"
  );
  assert.equal(foreign.events.length, 0);
  for (const result of [
    completed({ "../outside.csv": "x\ny" }),
    completed({ "outputs/bad.csv": "a,b\nx" }),
    {
      ...completed({ "outputs/table.csv": "a\nb" }),
      error: "python failed",
      exitCode: 1,
      status: "failed",
    },
  ]) {
    const context = setup();
    context.setResult(result);
    // biome-ignore lint/performance/noAwaitInLoops: Independent failure probes run sequentially.
    const output = await context.workspace.run("python3 script.py");
    assert.equal(output.status, "failed");
    assert.equal(output.artifacts.length, 0);
    assert.equal(context.writes.length, 0);
    assert.equal(context.events.length, 0);
  }
});

test("Vercel's native toolkit exposes bash/readFile/writeFile, with one persistence path and bounded file names", async () => {
  const { createWorkspaceTools } = await import("./workspace-tools");
  const context = setup();
  const tools = await createWorkspaceTools(
    context.workspace,
    new AbortController().signal
  );
  assert.deepEqual(Object.keys(tools).sort(), [
    "bash",
    "readFile",
    "writeFile",
  ]);
  const options = { context: {}, messages: [], toolCallId: "write" };
  const saved = await tools.writeFile.execute?.(
    { content: "名称,价格\n台灯,18\n", path: "outputs/table.csv" },
    options
  );
  assert.equal((saved as any).artifacts.length, 1);
  assert.equal(context.writes.length, 1);
  await assert.rejects(
    Promise.resolve().then(() =>
      tools.writeFile.execute?.({ content: "x", path: "/etc/secret" }, options)
    )
  );
  assert.equal(context.writes.length, 1);
  const executed = await tools.bash.execute?.({ command: "true" }, options);
  assert.equal((executed as any).status, "completed");
  assert.equal(
    context.writes.length,
    1,
    "native bash shares the same saved file state"
  );
});

test("readFile never saves outputs and failed commands never leak generated files into the next command", async () => {
  const context = setup();
  const { createWorkspaceTools } = await import("./workspace-tools");
  const tools = await createWorkspaceTools(
    context.workspace,
    new AbortController().signal
  );
  await tools.readFile.execute?.(
    { path: "sources/call.json" },
    { context: {}, messages: [], toolCallId: "read" }
  );
  assert.equal(context.writes.length, 0);
  assert.equal(context.events.length, 0);
  context.inspect((input) => {
    assert.equal(input.files["outputs/table.csv"], undefined);
    assert.equal(input.files["outputs/leaked.csv"], undefined);
  });
  context.setResult({
    ...completed({ "outputs/leaked.csv": "a\nb" }),
    exitCode: 1,
    status: "failed",
  });
  assert.equal((await context.workspace.run("false")).status, "failed");
  context.setResult(completed({}));
  assert.equal((await context.workspace.run("true")).status, "completed");
  assert.equal(context.writes.length, 0);
});

test("a database save failure and cancellation never publish an unsaved artifact", async () => {
  const events: unknown[] = [];
  const workspace = new BashWorkspace({
    execute: () =>
      Promise.resolve(completed({ "outputs/table.csv": "a\nb\n" })),
    messages: [],
    publish: (value) => events.push(value),
    release: () => Promise.resolve(),
    repository: {
      findLatestById: () => Promise.resolve(undefined),
      save: () => Promise.reject(new Error("database unavailable")),
    },
    sources: () => ({}),
    userId: "owner",
  });
  const result = await workspace.run("python3 script.py");
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /database unavailable/);
  assert.equal(events.length, 0);
  const controller = new AbortController();
  controller.abort(new Error("user stopped"));
  await assert.rejects(
    workspace.run("true", controller.signal),
    /user stopped/
  );
  assert.equal(events.length, 0);
});

test("source materialization uses its call snapshot and remains ordered with later operations", async () => {
  const calls: Record<string, string>[] = [];
  const workspace = new BashWorkspace({
    execute: (input) => {
      calls.push(input.files);
      return Promise.resolve(completed({}));
    },
    messages: [],
    publish: () => {
      /* No artifacts are expected for source materialization. */
    },
    release: () => Promise.resolve(),
    repository: {
      findLatestById: () => Promise.resolve(undefined),
      save: () => Promise.resolve([]),
    },
    sources: () => ({ "sources/later.json": "new cache contents" }),
    userId: "owner",
  });
  await Promise.all([
    workspace.syncSources({ "sources/original.json": "original response" }),
    workspace.run("true"),
  ]);
  assert.deepEqual(calls[0], { "sources/original.json": "original response" });
  assert.deepEqual(calls[1], { "sources/later.json": "new cache contents" });
});

test("native Bash and Read propagate each SDK call's cancellation to execution", {
  timeout: 5000,
}, async () => {
  const { createWorkspaceTools } = await import("./workspace-tools");
  for (const name of ["bash", "readFile"] as const) {
    const runtime = new AbortController();
    const call = new AbortController();
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    // A real adapter observes the exact signal supplied by the native tool.
    const workspace = new BashWorkspace({
      execute: (_input, signal) => {
        started();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
      messages: [],
      publish: () => {
        throw new Error("Cancelled work must not publish.");
      },
      release: () => Promise.resolve(),
      repository: {
        findLatestById: () => Promise.resolve(undefined),
        save: () => Promise.resolve([]),
      },
      sources: () => ({}),
      userId: "owner",
    });
    // biome-ignore lint/performance/noAwaitInLoops: Each toolkit has an independent execution context.
    const tools = await createWorkspaceTools(workspace, runtime.signal);
    const options = {
      abortSignal: call.signal,
      context: {},
      messages: [],
      toolCallId: name,
    };
    const pending = Promise.resolve(
      name === "bash"
        ? tools.bash.execute?.({ command: "sleep 20" }, options)
        : tools.readFile.execute?.({ path: "source.txt" }, options)
    );
    await entered;
    call.abort(new Error("individual tool cancelled"));
    // The test timeout bounds the regression if a native adapter loses cancellation.
    await assert.rejects(pending, /individual tool cancelled/);
    assert.equal(runtime.signal.aborted, false);
  }
});

test("native Bash preserves Python heredocs and shell syntax without an experimental rewrite", async () => {
  const { createWorkspaceTools } = await import("./workspace-tools");
  const context = setup();
  context.setResult(completed({}));
  const tools = await createWorkspaceTools(
    context.workspace,
    new AbortController().signal
  );
  for (const command of [
    "python3 - <<'PY' | cat\nprint('hello')\nPY",
    "cat <(printf hello) | cat",
    "echo $'line1\\nline2' | cat",
  ]) {
    context.inspect((input) => {
      assert.equal(input.command, `cd "/workspace" && ${command}`);
    });
    // biome-ignore lint/performance/noAwaitInLoops: Verify each command reaches the native runtime unchanged.
    const result = await tools.bash.execute?.(
      { command },
      { context: {}, messages: [], toolCallId: "native-syntax" }
    );
    assert.ok(result && "exitCode" in result);
    assert.equal(result.exitCode, 0);
  }
});
