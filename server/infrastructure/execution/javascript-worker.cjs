"use strict";

// A fresh QuickJS/WASM guest per process. No host functions, files or network
// are exposed. The parent owns cancellation and the process deadline.
const { getQuickJS } = require("quickjs-emscripten");

process.once("message", async ({ code }) => {
  let runtime;
  let context;
  let evaluated;
  try {
    if (typeof code !== "string" || code.length > 16_000) {
      throw new Error("Code exceeds execution input limit.");
    }
    const quickjs = await getQuickJS();
    runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(16 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const deadline = Date.now() + 1500;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    context = runtime.newContext();
    evaluated = context.evalCode(`(() => {
      const stringify = JSON.stringify;
      const logs = [];
      const log = (...args) => {
        if (logs.length < 20) logs.push(args.map(value => String(value).slice(0, 200)).join(' ').slice(0, 1000));
      };
      const console = Object.freeze({log, info: log, warn: log, error: log});
      const result = (() => { ${code}\n })();
      if (result && typeof result.then === 'function') throw new Error('Return a synchronous JSON result.');
      const output = stringify({status: 'completed', result, logs});
      if (output.length > 32000) throw new Error('Result exceeds 32000 characters; return a summary.');
      return output;
    })()`);
    if (evaluated.error) {
      throw new Error(
        context.dump(evaluated.error)?.message ?? "Execution failed."
      );
    }
    if (context.typeof(evaluated.value) !== "string") {
      throw new Error("Execution must return a serialized result.");
    }
    const output = context.getString(evaluated.value);
    // Guest source is untrusted and can bypass its wrapper's early checks.
    if (output.length > 32_000) {
      throw new Error("Result exceeds 32000 characters; return a summary.");
    }
    process.send?.(JSON.parse(output));
  } catch (error) {
    process.send?.({
      error: String(error?.message ?? "Execution failed.").slice(0, 1000),
      logs: [],
      status: "failed",
    });
  } finally {
    evaluated?.dispose();
    context?.dispose();
    runtime?.dispose();
    process.disconnect();
  }
});
