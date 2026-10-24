// biome-ignore-all lint/suspicious/useAwait: Deterministic offline fakes implement asynchronous production contracts.
// biome-ignore-all lint/style/noNonNullAssertion: Assertions establish fixture values before use.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptSettings,
  encryptSettings,
  parseEncryptionKey,
} from "@/lib/agent/mcp-settings/crypto";
import {
  guardedFetch,
  validateConnection,
} from "@/lib/agent/mcp-settings/network";
import { connectionSchema, parseImport } from "@/lib/agent/mcp-settings/schema";
import {
  authorizeManagement,
  managementReady,
} from "@/lib/agent/mcp-settings/security";

const id = "11111111-1111-4111-8111-111111111111";
const env = {
  MCP_ADMIN_USER_IDS: id,
  MCP_ALLOWED_ORIGINS: "https://fixture.example",
  MCP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
};
const connection = {
  headers: { Authorization: "Bearer SECRET" },
  url: "https://fixture.example/mcp?token=SECRET",
};
test("admin requires exact immutable regular UUID; mutation/test requires same Origin", () => {
  const request = new Request("https://chat.example/api/agent/mcp", {
    headers: { Origin: "https://chat.example" },
  });
  assert.equal(
    authorizeManagement({ id, type: "regular" }, request, true, env),
    id
  );
  for (const user of [
    undefined,
    { id, type: "guest" },
    { id: id.slice(0, -1), type: "regular" },
    { id: "fixture@example.org", type: "regular" },
  ]) {
    assert.throws(() => authorizeManagement(user, request, false, env));
  }
  assert.throws(() =>
    authorizeManagement(
      { id, type: "regular" },
      new Request(request.url),
      true,
      env
    )
  );
  assert.throws(() =>
    authorizeManagement(
      { id, type: "regular" },
      new Request(request.url, { headers: { Origin: "https://evil.example" } }),
      true,
      env
    )
  );
  assert.equal(managementReady({}), false);
  assert.throws(() => managementReady({ ...env, MCP_ALLOWED_ORIGINS: "*" }));
});
test("AES authenticated randomized revision/context envelope rejects tampering and invalid keys", () => {
  const key = parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY);
  for (const value of [
    undefined,
    "",
    Buffer.alloc(31).toString("base64"),
    `${env.MCP_SETTINGS_ENCRYPTION_KEY}\n`,
    "not-base64",
  ]) {
    assert.throws(() => parseEncryptionKey(value));
  }
  const a = encryptSettings([connection], 1, key),
    b = encryptSettings([connection], 1, key);
  assert.notEqual(a, b);
  assert.deepEqual(decryptSettings(a, 1, key), [connection]);
  assert.throws(() => decryptSettings(a, 2, key));
  assert.throws(() => decryptSettings(a, 1, Buffer.alloc(32, 4)));
  const parts = JSON.parse(a);
  parts.tag = Buffer.alloc(16).toString("base64");
  assert.throws(() => decryptSettings(JSON.stringify(parts), 1, key));
  assert.ok(!a.includes("SECRET"));
});
test("strict import only fills one HTTP connection and native tool names support dots", () => {
  const parsed = parseImport(
    JSON.stringify({
      mcpServers: {
        fixture: { headers: connection.headers, url: connection.url },
      },
    })
  );
  assert.equal(parsed.name, "fixture");
  assert.equal(parsed.connection.url, connection.url);
  for (const value of [
    { mcpServers: { a: { args: [], command: "node" } } },
    { mcpServers: { a: connection, b: connection } },
    { mcpServers: { a: { ...connection, command: "node" } } },
  ]) {
    assert.throws(() => parseImport(JSON.stringify(value)));
  }
  assert.throws(() => parseImport(" ".repeat(33_000)));
  assert.equal(
    connectionSchema.safeParse({
      headers: { Host: "evil" },
      url: connection.url,
    }).success,
    false
  );
});
test("network policy rejects endpoints and headers before network and constrains every fetch", async () => {
  validateConnection(connection, env);
  for (const bad of [
    "https://evil.example/mcp",
    "https://user:pass@fixture.example/mcp",
    "https://fixture.example/mcp#x",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal environment interpolation must be rejected.
    "https://fixture.example/${TOKEN}",
    "http://fixture.example/mcp",
  ]) {
    assert.throws(() => validateConnection({ ...connection, url: bad }, env));
  }
  for (const header of [
    "host",
    "Connection",
    "Cookie",
    "Transfer-Encoding",
    "Proxy-Authorization",
  ]) {
    assert.throws(() =>
      validateConnection({ ...connection, headers: { [header]: "x" } }, env)
    );
  }
  let calls = 0;
  const fetcher = guardedFetch(
    connection,
    env,
    AbortSignal.timeout(2000),
    async (_input, init) => {
      calls += 1;
      assert.equal(init?.redirect, "error");
      return new Response("ok");
    }
  );
  await assert.rejects(() => fetcher("https://evil.example/mcp"));
  await assert.rejects(() => fetcher("https://fixture.example/other"));
  assert.equal(calls, 0);
  assert.equal(
    await (await fetcher("https://fixture.example/mcp?sessionId=1")).text(),
    "ok"
  );
  const huge = guardedFetch(
    connection,
    env,
    AbortSignal.timeout(2000),
    async () => new Response("x".repeat(1024 * 1024 + 1))
  );
  await assert.rejects(async () => (await huge(connection.url)).text());
});
test("import preserves common external server names while generating an explicit valid internal id", () => {
  const value = parseImport(
    JSON.stringify({
      mcpServers: { "1688-Company": { url: "https://fixture.example/mcp" } },
    })
  );
  assert.equal(value.name, "1688-Company");
  assert.match(value.id, /^[a-z][a-z0-9_]{0,30}$/);
});
test("outbound request body limit rejects before sending, including Request objects", async () => {
  let calls = 0;
  const fetcher = guardedFetch(
    connection,
    env,
    AbortSignal.timeout(2000),
    async () => {
      calls += 1;
      return new Response("ok");
    }
  );
  await assert.rejects(() =>
    fetcher(connection.url, { body: "x".repeat(1_048_577), method: "POST" })
  );
  await assert.rejects(() =>
    fetcher(
      new Request(connection.url, {
        body: "x".repeat(1_048_577),
        method: "POST",
      })
    )
  );
  assert.equal(calls, 0);
});
test("management Origin matches received Host when Next normalizes Request URL, not forwarded arbitrary values", () => {
  const user = { id, type: "regular" };
  const request = (origin: string) =>
    new Request("http://localhost:3000/api/agent/mcp", {
      headers: { host: "127.0.0.1:3000", origin },
    });
  assert.equal(
    authorizeManagement(user, request("http://127.0.0.1:3000"), true, env),
    id
  );
  assert.throws(() =>
    authorizeManagement(user, request("https://evil.example"), true, env)
  );
  assert.throws(() => authorizeManagement(user, request("null"), true, env));
});
test("deployment origins reject literal wildcard hostnames rather than accepting them as exact origins", () => {
  assert.throws(() =>
    managementReady({
      ...env,
      MCP_ALLOWED_ORIGINS: "https://*.fixture.example",
    })
  );
});
