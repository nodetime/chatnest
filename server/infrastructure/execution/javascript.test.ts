import assert from "node:assert/strict";
import { test } from "node:test";
import { executeJavascript } from "./javascript";

test("actual QuickJS executes calculations and returns bounded logs without host APIs", async () => {
  const output = await executeJavascript(`
    console.log('calculated');
    return { sum: [3, 7, 11].reduce((a,b) => a+b, 0),
      host: [typeof process, typeof require, typeof fetch, typeof importScripts] };
  `);
  assert.equal(output.status, "completed");
  assert.deepEqual(output.result, {
    host: new Array(4).fill("undefined"),
    sum: 21,
  });
  assert.deepEqual(output.logs, ["calculated"]);
});

test("guest state is not shared and promise-like results cannot claim completion", async () => {
  assert.equal(
    (await executeJavascript("globalThis.secret = 123; return 1;")).status,
    "completed"
  );
  assert.equal(
    (await executeJavascript("return typeof secret;")).result,
    "undefined"
  );
  assert.equal(
    (await executeJavascript("return Promise.resolve(3);")).status,
    "failed"
  );
});

test("infinite loops, oversized output, memory exhaustion and syntax errors fail", async () => {
  for (const code of [
    "while(true) {}",
    "return 'x'.repeat(40000);",
    "return new Array(100000000).fill('memory');",
    "this is not JavaScript",
    `})(); return JSON.stringify({status:"completed",logs:[],result:"x".repeat(50000)}); (()=>{`,
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: Bounded sequential failure probes avoid concurrent resource pressure.
    const output = await executeJavascript(code);
    assert.equal(output.status, "failed", code);
    assert.ok(output.error);
  }
});

test("abort stops a running child and already-aborted work never starts", async () => {
  const controller = new AbortController();
  const pending = executeJavascript("while(true) {}", controller.signal);
  setTimeout(() => controller.abort(new Error("user stopped")), 80);
  await assert.rejects(pending, /user stopped/);
  assert.throws(
    () => executeJavascript("return 1;", controller.signal),
    /user stopped/
  );
});

test("concurrent work has bounded admission and releases capacity after child exit", async () => {
  const controller = new AbortController();
  const first = executeJavascript("while(true) {}", controller.signal);
  const second = executeJavascript("while(true) {}", controller.signal);
  const outcomes = Promise.allSettled([first, second]);
  assert.equal((await executeJavascript("return 3;")).status, "failed");
  controller.abort(new Error("stop probes"));
  await outcomes;
  assert.equal((await executeJavascript("return 4;")).result, 4);
});
