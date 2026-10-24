// biome-ignore-all lint/suspicious/useAwait: Deterministic offline fakes implement asynchronous production contracts.
// biome-ignore-all lint/style/noNonNullAssertion: Assertions establish fixture values before use.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createManagementHandler } from "@/server/agent/mcp-settings/api";

const id = "11111111-1111-4111-8111-111111111111",
  env = { MCP_ADMIN_USER_IDS: id };
test("real API boundary protects GET and all writes/test before body/network; bounded body and generic errors", async () => {
  let user: { id: string; type: string } | null = { id, type: "guest" },
    calls = 0;
  const handler = createManagementHandler({
    env,
    file: async () => [],
    service: {
      get: async () => {
        calls += 1;
        return {};
      },
      mutate: async () => {
        calls += 1;
        return {};
      },
      test: async () => {
        calls += 1;
        return { tools: [] };
      },
    },
    session: async () => user,
  } as never);
  const url = "https://chat.example/api/agent/mcp";
  assert.equal((await handler(new Request(url))).status, 403);
  user = null;
  assert.equal((await handler(new Request(url))).status, 401);
  user = { id, type: "regular" };
  assert.equal((await handler(new Request(url))).status, 200);
  assert.equal(calls, 1);
  assert.equal(
    (
      await handler(
        new Request(url, { body: '{"action":"test"}', method: "POST" })
      )
    ).status,
    403
  );
  assert.equal(calls, 1);
  const send = (body: string) =>
    handler(
      new Request(url, {
        body,
        headers: { Origin: "https://chat.example" },
        method: "POST",
      })
    );
  assert.equal((await send("x".repeat(32_769))).status, 413);
  assert.equal(
    (
      await send(
        JSON.stringify({
          action: "test",
          connection: {
            mode: "replace",
            value: { headers: {}, url: "https://fixture.example" },
          },
        })
      )
    ).status,
    200
  );
  assert.equal(
    (await send(JSON.stringify({ action: "test", command: "node" }))).status,
    400
  );
});
