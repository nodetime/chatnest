import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deactivatePlatformIdentity,
  exchangePlatformIdentity,
} from "./identity";

test("identity exchange sends the personal display name for first-use provisioning", async () => {
  let request: Request | undefined;
  const result = await exchangePlatformIdentity({
    baseUrl: "https://platform.example",
    displayName: "本地账号",
    fetcher: (input, init) => {
      request = new Request(input, init);
      return Promise.resolve(
        Response.json({
          audience: "platform-billing",
          expiresAt: "2026-10-31T01:00:00.000Z",
          issuer: "payload",
          scope: ["platform:billing"],
          subject: "42",
          token: "short-lived-token",
        })
      );
    },
    issuer: "chatnest",
    serviceToken: "service-token",
    subject: "chatnest-user-42",
  });
  assert.equal(result.subject, "42");
  assert.deepEqual(await request?.json(), {
    audience: "platform-billing",
    displayName: "本地账号",
    issuer: "chatnest",
    subject: "chatnest-user-42",
  });
});

test("identity deactivation uses the internal service boundary", async () => {
  let request: Request | undefined;
  const result = await deactivatePlatformIdentity({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      request = new Request(input, init);
      return Promise.resolve(Response.json({ deactivated: true }));
    },
    issuer: "chatnest",
    serviceToken: "service-token",
    subject: "chatnest-user-42",
  });
  assert.equal(result.deactivated, true);
  assert.equal(
    request?.url,
    "https://platform.example/api/platform/v1/internal/identity/deactivate"
  );
  assert.equal(request?.headers.get("X-Platform-Internal"), "1");
  assert.deepEqual(await request?.json(), {
    issuer: "chatnest",
    subject: "chatnest-user-42",
  });
});

test("identity denial preserves 403 without reflecting provider error text", async () => {
  await assert.rejects(
    () =>
      exchangePlatformIdentity({
        baseUrl: "https://platform.example",
        fetcher: () =>
          Promise.resolve(
            Response.json({ code: "private-canary" }, { status: 403 })
          ),
        issuer: "chatnest",
        serviceToken: "fixture",
        subject: "fixture",
      }),
    (error) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 403 &&
      !error.message.includes("private-canary")
  );
});

test("identity HTTP failure preserves status even with non-JSON or empty bodies", async () => {
  await Promise.all(
    [401, 403, 503].map((status) =>
      assert.rejects(
        () =>
          exchangePlatformIdentity({
            baseUrl: "https://platform.example",
            fetcher: () =>
              Promise.resolve(
                new Response(
                  status === 401 ? "" : "<html>private-canary</html>",
                  { status }
                )
              ),
            issuer: "chatnest",
            serviceToken: "fixture",
            subject: "fixture",
          }),
        (error) =>
          error instanceof Error &&
          "status" in error &&
          error.status === status &&
          !error.message.includes("private-canary")
      )
    )
  );
});
