import assert from "node:assert/strict";
import { test } from "node:test";
import { createCheckoutIdempotencyKey } from "./idempotency";

test("checkout keys are one bounded ASCII format even for maximum Unicode slugs", async () => {
  const key = await createCheckoutIdempotencyKey({
    nonce: "nonce-1",
    planSlug: "😀".repeat(128),
    userId: "user-7",
  });
  assert.match(key, /^checkout:[a-f0-9]{64}$/);
  assert.equal(key.length, 73);
  assert.doesNotThrow(() => new Headers({ "Idempotency-Key": key }));
});
test("checkout key binds exact caller fields and stays stable across retries", async () => {
  const input = { nonce: "nonce-1", planSlug: "plan", userId: "user-7" };
  const key = await createCheckoutIdempotencyKey(input);
  assert.equal(await createCheckoutIdempotencyKey(input), key);
  await Promise.all(
    [{ nonce: "nonce-2" }, { planSlug: " plan " }, { userId: "user-8" }].map(
      async (change) => {
        assert.notEqual(
          await createCheckoutIdempotencyKey({ ...input, ...change }),
          key
        );
      }
    )
  );
  await assert.rejects(
    async () => createCheckoutIdempotencyKey({ nonce: "", planSlug: "plan" }),
    /IDEMPOTENCY_INPUT_INVALID/
  );
});
