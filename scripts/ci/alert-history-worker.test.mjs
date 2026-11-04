// biome-ignore-all lint/suspicious/useAwait: async fetch fixture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverAlert } from "../alert-history.mjs";

test("history failure never hides the sink outcome or leaks private response text", async () => {
  const calls = [];
  const failures = [];
  const result = await deliverAlert({
    alertUrl: "http://sink.test/private",
    baseUrl: "http://127.0.0.1",
    controlToken: "token",
    details: { reason: "timeout" },
    fetcher: async (url, init) => {
      calls.push({ body: JSON.parse(init.body), url });
      return new Response(
        String(url).includes("alert-events") ? "private-canary" : null,
        { status: String(url).includes("alert-events") ? 503 : 204 }
      );
    },
    kind: "worker_failed",
    onHistoryFailure: () => failures.push(true),
  });
  assert.equal(result, true);
  assert.equal(calls.length, 5);
  assert.equal(failures.length, 2);
  assert.equal(calls[0].body.outcome, "pending");
  assert.equal(calls[4].body.outcome, "delivered");
  assert.equal(calls[4].body.httpStatus, 204);
  assert.doesNotMatch(JSON.stringify(calls[0].body), /token|private|http:/);
});

test("all token-bearing history and sink writes reject redirects", async () => {
  const options = [];
  await deliverAlert({
    alertUrl: "http://sink.test",
    baseUrl: "http://127.0.0.1",
    controlToken: "private",
    details: { reason: "timeout" },
    fetcher: async (_url, init) => {
      options.push(init);
      return new Response(null, { status: 204 });
    },
    kind: "worker_failed",
  });
  assert.equal(options.length, 3);
  assert.ok(options.every((option) => option.redirect === "error"));
});

test("transient history failures retry identical facts once without resending the sink", async () => {
  const bodies = [];
  const signals = [];
  let sink = 0;
  let failures = 0;
  const delivered = await deliverAlert({
    alertUrl: "http://sink.test",
    baseUrl: "http://127.0.0.1",
    controlToken: "private",
    details: { reason: "timeout" },
    fetcher: async (url, init) => {
      if (!String(url).includes("alert-events")) {
        sink += 1;
        return new Response(null, { status: 204 });
      }
      bodies.push(init.body);
      signals.push(init.signal);
      return new Response(null, { status: bodies.length % 2 ? 503 : 204 });
    },
    kind: "worker_failed",
    onHistoryFailure: () => {
      failures += 1;
    },
  });
  assert.equal(delivered, true);
  assert.equal(sink, 1);
  assert.equal(failures, 0);
  assert.equal(bodies.length, 4);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(bodies[2], bodies[3]);
  assert.equal(JSON.parse(bodies[0]).id, JSON.parse(bodies[2]).id);
  assert.equal(new Set(signals).size, 4);
});

test("permanent history failures are not retried and never suppress the one sink attempt", async () => {
  for (const status of [400, 401, 403, 409, 413]) {
    let history = 0;
    let sink = 0;
    let failures = 0;
    // biome-ignore lint/performance/noAwaitInLoops: status table.
    const result = await deliverAlert({
      alertUrl: "http://sink.test",
      baseUrl: "http://127.0.0.1",
      controlToken: "private",
      details: { reason: "timeout" },
      fetcher: async (url) => {
        if (String(url).includes("alert-events")) {
          history += 1;
          return new Response(null, { status });
        }
        sink += 1;
        return new Response(null, { status: 204 });
      },
      kind: "worker_failed",
      onHistoryFailure: () => {
        failures += 1;
      },
    });
    assert.equal(result, true);
    assert.equal(history, 2);
    assert.equal(sink, 1);
    assert.equal(failures, 2);
  }
});

test("lost history responses retry the same id and final failure is reported once per fact", async () => {
  const ids = [];
  let history = 0;
  let sink = 0;
  let failures = 0;
  const result = await deliverAlert({
    alertUrl: "http://sink.test",
    baseUrl: "http://127.0.0.1",
    controlToken: "private",
    details: { reason: "timeout" },
    fetcher: async (url, init) => {
      if (String(url).includes("alert-events")) {
        history += 1;
        ids.push(JSON.parse(init.body).id);
        if (history === 2) {
          return new Response(null, { status: 204 });
        }
        throw new Error("response lost private-canary");
      }
      sink += 1;
      return new Response(null, { status: 204 });
    },
    kind: "worker_failed",
    onHistoryFailure: () => {
      failures += 1;
    },
  });
  assert.equal(result, true);
  assert.equal(history, 4);
  assert.equal(sink, 1);
  assert.equal(failures, 1);
  assert.equal(new Set(ids).size, 1);
});
