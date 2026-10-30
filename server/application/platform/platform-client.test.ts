import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPlatformBillingClient,
  PlatformHttpError,
} from "@/server/application/platform/client";

test("platform client sends separated credentials, idempotency and rejects redirects/errors", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({ holdId: "hold-1", reservedPoints: "2" })
      );
    },
    serviceToken: "service-token",
    userToken: "user-token",
  });
  const result = await client.reserve({
    attemptId: "attempt-1",
    operationId: "operation-1",
    subjectId: "user-1",
    tool: { api: "search", platform: "1688", provider: "onebound" },
  });
  assert.deepEqual(result, { holdId: "hold-1", reservedPoints: "2" });
  assert.equal(
    requests[0].headers.get("Authorization"),
    "Bearer service-token"
  );
  assert.equal(requests[0].headers.get("X-Platform-User-Token"), "user-token");
  assert.equal(
    requests[0].headers.get("Idempotency-Key"),
    "operation-1:reserve"
  );
});

test("platform client surfaces business errors without fallback", async () => {
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: () =>
      Promise.resolve(
        Response.json({ code: "INSUFFICIENT_CREDITS" }, { status: 409 })
      ),
    serviceToken: "service-token",
    userToken: "user-token",
  });
  await assert.rejects(
    client.reserve({
      attemptId: "attempt-1",
      operationId: "operation-1",
      subjectId: "user-1",
      tool: { api: "search", platform: "1688", provider: "onebound" },
    }),
    (error: unknown) =>
      error instanceof PlatformHttpError &&
      error.status === 409 &&
      error.code === "INSUFFICIENT_CREDITS"
  );
});
