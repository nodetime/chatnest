import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import {
  authorizeManagementAsync,
  SettingsError,
} from "@/server/application/mcp/security";
import { authorizeUploadRequestAsync } from "@/server/shared/uploads/security";
import { UploadError } from "@/server/shared/uploads/validation";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "regular",
};
const env = {
  PLATFORM_BASE_URL: "https://platform.example.test",
  PLATFORM_MODE: "connected",
  PLATFORM_SERVICE_TOKEN: "service-token",
  PLATFORM_USER_ISSUER: "chatnest",
};

test("connected management gates use Payload capability instead of the local allowlist", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = (input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          adminId: 9,
          allowed: true,
          requestId: "fixture",
          role: "admin",
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
  };
  try {
    const request = new Request("https://chat.example.test/admin");
    assert.equal(
      await authorizeManagementAsync(user, request, false, env),
      user.id
    );
    assert.equal(
      await authorizeUploadRequestAsync(user, request, false, true, env),
      user.id
    );
    assert.equal(requests.length, 2);
    assert.equal(
      requests[0].headers.get("X-Platform-Admin-Issuer"),
      "chatnest"
    );
    assert.equal(requests[0].headers.get("X-Platform-Admin-Subject"), user.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("connected management fails closed for a malformed successful capability", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ adminId: 9, allowed: false, role: "operator" }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
  try {
    const request = new Request("https://chat.example.test/admin");
    await assert.rejects(
      authorizeManagementAsync(user, request, false, env),
      (error: unknown) => error instanceof SettingsError && error.status === 403
    );
    await assert.rejects(
      authorizeUploadRequestAsync(user, request, false, true, env),
      (error: unknown) => error instanceof UploadError && error.status === 403
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operator capability cannot perform billing reconciliation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          adminId: 9,
          allowed: true,
          requestId: "fixture",
          role: "operator",
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
  try {
    assert.equal(await resolvePlatformAdmin(user, env), true);
    assert.equal(await resolvePlatformAdmin(user, env, "admin"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("connected management denies real 403 and incomplete 200 capability without local fallback", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [403, 200]) {
      globalThis.fetch = () =>
        Promise.resolve(
          Response.json(
            status === 403
              ? {
                  code: "ADMIN_REQUIRED",
                  message: "denied",
                  requestId: "fixture",
                }
              : { adminId: 9, allowed: true, role: "admin" },
            { status }
          )
        );
      assert.equal(
        // biome-ignore lint/performance/noAwaitInLoops: independently prove transport denial and malformed success both fail closed.
        await resolvePlatformAdmin(user, {
          ...env,
          PLATFORM_ADMIN_USER_IDS: user.id,
        }),
        false
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
