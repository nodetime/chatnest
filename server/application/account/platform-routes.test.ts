// biome-ignore-all lint/performance/noAwaitInLoops: ordered route inputs verify dependency calls and cookie effects without shared external services.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { PlatformHttpError } from "../platform/client";

const require = createRequire(import.meta.url);
type Handler = (
  request: Request,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;
function route(
  path: string,
  options: {
    authenticated?: boolean;
    enabled?: boolean;
    cookie?: string;
    failure?: Error;
    identityFailure?: Error;
  } = {}
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const cookieChanges: unknown[] = [];
  let exchanges = 0;
  const client = Object.fromEntries(
    [
      "plans",
      "subscriptions",
      "sessionList",
      "sessionDetails",
      "createCheckoutIntent",
      "checkoutStatus",
      "createOrganization",
      "listOrganizationMembers",
      "addOrganizationMember",
      "organizations",
    ].map((method) => [
      method,
      (...args: unknown[]) => {
        calls.push({ args, method });
        if (options.failure) {
          return Promise.reject(options.failure);
        }
        return Promise.resolve(
          method === "organizations"
            ? { organizations: [{ id: 7 }], requestId: "fixture" }
            : { ok: true }
        );
      },
    ])
  );
  const replacements: Record<string, unknown> = {
    "@/app/(auth)/auth": {
      auth: async () =>
        options.authenticated === false
          ? null
          : { user: { id: "user-1", type: "regular" } },
    },
    "@/server/application/platform/user-client": {
      createUserPlatformClient: () => {
        exchanges += 1;
        if (options.identityFailure) {
          return Promise.reject(options.identityFailure);
        }
        return Promise.resolve(client);
      },
    },
    "@/server/shared/env": {
      getEnv: () => ({}),
      organizationsEnabled: () => options.enabled !== false,
    },
    "next/headers": {
      cookies: async () => ({
        delete: (...args: unknown[]) => cookieChanges.push(args),
        get: () =>
          options.cookie === undefined ? undefined : { value: options.cookie },
        set: (...args: unknown[]) => cookieChanges.push(args),
      }),
    },
  };
  const output = { exports: {} as Record<string, Handler> };
  const source = ts.transpileModule(
    readFileSync(`app/(chat)/api/${path}/route.ts`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  new Function("require", "module", "exports", source)(
    (name: string) =>
      replacements[name] ??
      require(
        name.startsWith("@/") ? `${process.cwd()}/${name.slice(2)}` : name
      ),
    output,
    output.exports
  );
  return {
    calls,
    cookieChanges,
    get exchanges() {
      return exchanges;
    },
    GET: output.exports.GET,
    POST: output.exports.POST,
  };
}
function request(
  path: string,
  body?: unknown,
  query = "",
  headers: Record<string, string> = {}
) {
  return new Request(`https://chat.example/api/${path}${query}`, {
    headers: {
      "content-type": "application/json",
      host: "chat.example",
      origin: "https://chat.example",
      ...headers,
    },
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = { params: Promise.resolve({ organizationId: "7" }) };
for (const path of [
  "billing/checkout",
  "organizations",
  "organizations/select",
  "organizations/[organizationId]/members",
]) {
  test(`actual C write ${path} rejects null/wrong shape without identity or mutations`, async () => {
    for (const body of [
      null,
      [],
      { extra: true },
      { name: 123 },
      { organizationId: false },
    ]) {
      const r = route(path);
      const response = await r.POST(request(path, body), context);
      assert.equal(response.status, 400);
      assert.equal(r.exchanges, 0);
      assert.equal(r.calls.length, 0);
      assert.deepEqual(r.cookieChanges, []);
    }
  });
  test(`actual C write ${path} rejects cross-origin before body/identity`, async () => {
    const r = route(path);
    const response = await r.POST(
      request(path, null, "", { origin: "https://elsewhere.example" }),
      context
    );
    assert.equal(response.status, 403);
    assert.equal(r.exchanges, 0);
    assert.equal(r.calls.length, 0);
  });
  test(`actual C write ${path} enforces a streaming byte budget`, async () => {
    const r = route(path);
    let reads = 0;
    let cancelled = false;
    const stream = new ReadableStream(
      {
        cancel() {
          cancelled = true;
          return new Promise<void>(() => {
            /* Intentionally pending: cancellation must not block413. */
          });
        },
        pull(c) {
          const first = reads === 0;
          reads += 1;
          if (first) {
            c.enqueue(new Uint8Array(65_537));
          }
        },
      },
      { highWaterMark: 0 }
    );
    const req = new Request(`https://chat.example/api/${path}`, {
      body: stream,
      duplex: "half",
      headers: {
        "content-type": "application/json",
        host: "chat.example",
        origin: "https://chat.example",
      },
      method: "POST",
    } as RequestInit);
    const result = await Promise.race([
      r.POST(req, context),
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(new Response(null, { status: 599 })), 500)
      ),
    ]);
    assert.equal(result.status, 413);
    assert.equal(reads, 1);
    assert.equal(cancelled, true);
    assert.equal(r.exchanges, 0);
    assert.deepEqual(r.cookieChanges, []);
  });
}
for (const path of ["billing", "billing/plans", "billing/subscriptions"]) {
  test(`actual C ${path} distinguishes explicit personal scope from cookie fallback`, async () => {
    for (const [query, expected] of [
      ["?organizationId=", undefined],
      ["", "7"],
      ["?organizationId=9", "9"],
    ] as const) {
      const r = route(path, { cookie: "7" });
      assert.equal((await r.GET(request(path, undefined, query))).status, 200);
      assert.deepEqual(r.calls[0].args, [expected]);
    }
  });
  test(`actual C ${path} rejects duplicate/unknown query before identity`, async () => {
    for (const query of [
      "?organizationId=&organizationId=9",
      "?organizationId=7&extra=x",
      "?organizationId=0",
      "?organizationId=false",
    ]) {
      const r = route(path, { cookie: "7" });
      assert.equal((await r.GET(request(path, undefined, query))).status, 400);
      assert.equal(r.exchanges, 0);
    }
  });
  test(`actual C ${path} disabled capability rejects explicit organization, ignoring only a stale cookie`, async () => {
    const denied = route(path, { cookie: "7", enabled: false });
    assert.equal(
      (await denied.GET(request(path, undefined, "?organizationId=7"))).status,
      403
    );
    assert.equal(denied.exchanges, 0);
    const personal = route(path, { cookie: "7", enabled: false });
    assert.equal((await personal.GET(request(path))).status, 200);
    assert.deepEqual(personal.calls[0].args, [undefined]);
  });
}
test("actual checkout preserves explicit null/empty personal and absent cookie scope", async () => {
  for (const [fields, expected] of [
    [{ organizationId: null }, undefined],
    [{ organizationId: "" }, undefined],
    [{}, "7"],
  ] as const) {
    const r = route("billing/checkout", { cookie: "7" });
    assert.equal(
      (
        await r.POST(
          request("billing/checkout", {
            idempotencyKey: "key",
            planSlug: "plan",
            ...fields,
          })
        )
      ).status,
      201
    );
    assert.equal(
      (r.calls[0].args[0] as { organizationId?: string }).organizationId,
      expected
    );
  }
});
test("actual C organization errors are typed or fixed, never arbitrary upstream messages", async () => {
  for (const failure of [
    new Error("private-canary"),
    new PlatformHttpError(403, "ORGANIZATION_FORBIDDEN"),
  ]) {
    const r = route("organizations", { failure });
    const response = await r.GET(request("organizations"));
    assert.equal(
      response.status,
      failure instanceof PlatformHttpError ? 403 : 502
    );
    assert.equal((await response.text()).includes("private-canary"), false);
  }
});
test("actual checkout status and shared details preserve Unicode/whitespace identifiers, reject duplicate keys", async () => {
  const status = route("billing/checkout/status");
  assert.equal(
    (
      await status.GET(
        request("billing/checkout/status", undefined, "?checkoutId=%20id%20")
      )
    ).status,
    200
  );
  assert.deepEqual(status.calls[0].args, [" id "]);
  const bad = route("billing/checkout/status");
  assert.equal(
    (
      await bad.GET(
        request(
          "billing/checkout/status",
          undefined,
          "?checkoutId=a&checkoutId=b"
        )
      )
    ).status,
    400
  );
  assert.equal(bad.exchanges, 0);
  const details = route("billing");
  const id = "😀".repeat(129);
  assert.equal(
    (
      await details.GET(
        request(
          "billing",
          undefined,
          `?sessionGroupId=${encodeURIComponent(id)}&limit=1`
        )
      )
    ).status,
    200
  );
  assert.deepEqual(details.calls[0].args, [
    id,
    { cursor: undefined, limit: 1 },
  ]);
});

for (const [path, body] of [
  ["billing/checkout", { idempotencyKey: "key", planSlug: "plan" }],
  ["organizations", { name: "Name" }],
  ["organizations/select", { organizationId: 7 }],
  ["organizations/[organizationId]/members", { userId: "2" }],
] as const) {
  test(`actual C ${path} rejects unknown keys on an otherwise legitimate body`, async () => {
    const r = route(path);
    assert.equal(
      (await r.POST(request(path, { ...body, extra: true }), context)).status,
      400
    );
    assert.equal(r.exchanges, 0);
  });
  test(`actual C ${path} unauthorized rejection precedes parsing and identity`, async () => {
    const r = route(path, { authenticated: false });
    assert.equal((await r.POST(request(path, null), context)).status, 401);
    assert.equal(r.exchanges, 0);
    assert.deepEqual(r.cookieChanges, []);
  });
}
test("C typed identity errors survive the BFF instead of being replaced with not-connected", async () => {
  for (const path of [
    "billing",
    "billing/plans",
    "billing/subscriptions",
    "organizations",
  ]) {
    const r = route(path, {
      identityFailure: new PlatformHttpError(401, "IDENTITY_EXPIRED"),
    });
    const response = await r.GET(request(path));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "IDENTITY_EXPIRED" });
    assert.equal(r.calls.length, 0);
  }
});
test("selection checks membership and input before changing cookie; disabled only clears stale selection", async () => {
  const denied = route("organizations/select", { cookie: "7" });
  assert.equal(
    (await denied.POST(request("organizations/select", { organizationId: 9 })))
      .status,
    403
  );
  assert.deepEqual(denied.cookieChanges, []);
  const cleared = route("organizations/select", {
    cookie: "7",
    enabled: false,
  });
  assert.equal(
    (
      await cleared.POST(
        request("organizations/select", { organizationId: null })
      )
    ).status,
    200
  );
  assert.equal(cleared.exchanges, 0);
  assert.equal(cleared.cookieChanges.length, 1);
});
test("members preserve canonical string user IDs and validate path before identity", async () => {
  const valid = route("organizations/[organizationId]/members");
  assert.equal(
    (
      await valid.POST(
        request("organizations/[organizationId]/members", { userId: "2" }),
        context
      )
    ).status,
    201
  );
  assert.deepEqual(valid.calls[0].args, [{ organizationId: "7", userId: "2" }]);
  const bad = route("organizations/[organizationId]/members");
  assert.equal(
    (
      await bad.GET(request("organizations/[organizationId]/members"), {
        params: Promise.resolve({ organizationId: "01" }),
      })
    ).status,
    400
  );
  assert.equal(bad.exchanges, 0);
});

test("disabled selection validates body and rejects explicit organization before changing cookie", async () => {
  for (const [body, status] of [
    [{ organizationId: 7 }, 403],
    [null, 400],
    [{ organizationId: false }, 400],
  ] as const) {
    const r = route("organizations/select", { cookie: "7", enabled: false });
    assert.equal(
      (await r.POST(request("organizations/select", body))).status,
      status
    );
    assert.deepEqual(r.cookieChanges, []);
    assert.equal(r.exchanges, 0);
  }
});
