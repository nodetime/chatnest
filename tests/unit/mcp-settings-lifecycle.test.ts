// biome-ignore-all lint/suspicious/useAwait: Offline async SDK fixtures intentionally avoid I/O.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MCPClient } from "@ai-sdk/mcp";
import {
  abortable,
  closeManagedClient,
} from "../../lib/agent/mcp-settings/lifecycle";
import { listNativeTools } from "../../lib/agent/mcp-settings/native-tools";

test("complete RPC race releases abort listeners on success, failure and cancellation", async () => {
  const controller = new AbortController();
  const { signal } = controller;
  let added = 0,
    removed = 0;
  const add = signal.addEventListener.bind(signal),
    remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (
    ...args: Parameters<typeof signal.addEventListener>
  ) => {
    added += 1;
    return add(...args);
  };
  signal.removeEventListener = (
    ...args: Parameters<typeof signal.removeEventListener>
  ) => {
    removed += 1;
    return remove(...args);
  };
  assert.equal(await abortable(() => 7, signal), 7);
  await assert.rejects(
    () =>
      abortable(() => {
        throw new Error("secret");
      }, signal),
    /operation failed/
  );
  const pending = abortable(
    () =>
      new Promise(() => {
        /* Stalled RPC. */
      }),
    signal
  );
  controller.abort();
  await assert.rejects(() => pending, /cancelled/);
  assert.equal(added, removed);
});
test("close is bounded even if transport never resolves; no RPC names silently overwrite or paginate", async () => {
  const keepAlive = setTimeout(() => undefined, 200);
  const before = Date.now();
  try {
    await closeManagedClient(
      {
        close: () =>
          new Promise(() => {
            /* Stalled close. */
          }),
      },
      10
    );
    assert.ok(Date.now() - before < 150);
  } finally {
    clearTimeout(keepAlive);
  }
  const remote = { inputSchema: { type: "object" }, name: "search.web" };
  for (const result of [
    { tools: [remote, remote] },
    { nextCursor: "more", tools: [remote] },
  ]) {
    const client = { listTools: async () => result } as unknown as MCPClient;
    // biome-ignore lint/performance/noAwaitInLoops: Independent invalid fixture assertions are intentionally sequential.
    await assert.rejects(() =>
      listNativeTools(client, AbortSignal.timeout(100))
    );
  }
});
