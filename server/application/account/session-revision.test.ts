import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSessionRevision } from "@/server/application/account/session-revision";

test("session revision binds new and legacy JWTs to the current user revision", async () => {
  const read = () => Promise.resolve(4);

  assert.equal(
    await resolveSessionRevision({
      read,
      tokenRevision: undefined,
      userId: "u",
    }),
    4
  );
  assert.equal(
    await resolveSessionRevision({ read, tokenRevision: 4, userId: "u" }),
    4
  );
  assert.equal(
    await resolveSessionRevision({ read, tokenRevision: 3, userId: "u" }),
    null
  );
  assert.equal(
    await resolveSessionRevision({
      read: async () => null,
      tokenRevision: undefined,
      userId: "u",
    }),
    null
  );
});
