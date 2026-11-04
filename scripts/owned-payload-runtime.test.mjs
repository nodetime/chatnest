import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwnedPayloadRuntime } from "./owned-payload-runtime.mjs";

const valid = `postgres://heymoro_native_app_123456abcdef:${"a".repeat(64)}@127.0.0.1:5433/heymoro_native_api_acceptance`;
test("owned parent URI accepts only the ephemeral nonowner identity", () => {
  assert.equal(isOwnedPayloadRuntime(valid), true);
  for (const value of [
    undefined,
    "",
    "postgres://postgres:postgres@127.0.0.1:5433/heymoro_native_api_acceptance",
    valid.replace("5433", "5432"),
    valid.replace("127.0.0.1", "remote.test"),
    valid.replace("/heymoro_native_api_acceptance", "/heymoro"),
    `${valid}?host=remote.test`,
    `${valid}#fragment`,
    valid.replace("123456abcdef", "1234"),
    valid.replace("a".repeat(64), "short"),
    valid.replace("postgres:", "http:"),
  ]) {
    assert.equal(isOwnedPayloadRuntime(value), false);
  }
});

test("owned ChatNest runtime accepts only its random nonowner login", async () => {
  const { isOwnedChatnestRuntime } = await import(
    "./owned-payload-runtime.mjs"
  );
  assert.equal(typeof isOwnedChatnestRuntime, "function");
  const uri = `postgres://chatnest_connected_app_123456abcdef:${"a".repeat(64)}@127.0.0.1:55432/chatnest_platform_connected_acceptance`;
  assert.equal(isOwnedChatnestRuntime(uri), true);
  for (const value of [
    undefined,
    "",
    uri.replace("chatnest_connected_app_123456abcdef", "chatnest"),
    uri.replace("55432", "5433"),
    uri.replace("127.0.0.1", "remote.test"),
    uri.replace("/chatnest_platform_connected_acceptance", "/chatnest"),
    `${uri}?host=remote.test`,
    `${uri}#fragment`,
    uri.replace("a".repeat(64), "short"),
  ]) {
    assert.equal(isOwnedChatnestRuntime(value), false);
  }
});
