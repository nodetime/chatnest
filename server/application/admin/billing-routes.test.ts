import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import {
  createPlatformBillingClient,
  type PlatformClientOptions,
  platformResponseError,
} from "../platform/client";

type Handler = (
  request: Request,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;
const require = createRequire(import.meta.url);
const uuid = "11111111-1111-4111-8111-111111111111";
const date = "2026-11-02T00:00:00.000Z";
const approval = {
  action: "reconcile",
  approvalId: "approval-1",
  approvedAt: null,
  approvedBy: null,
  consumedAt: null,
  decision: "release_reserved",
  deltaPoints: null,
  disputeReviewSnapshot: null,
  expiresAt: date,
  mutationHash: null,
  organizationId: null,
  reason: "verified",
  recoverySnapshot: null,
  requestedBy: 1,
  requestedRevision: date,
  resourceId: "operation-1",
  status: "pending",
};
function loadRoute(
  path: string,
  allowed = true,
  role: "admin" | "operator" = "admin"
) {
  const requests: Request[] = [];
  const options = {
    access: {
      resolvePlatformAdmin: async (
        _user: unknown,
        _env: unknown,
        requiredRole?: string
      ) => allowed && (requiredRole !== "admin" || role === "admin"),
    },
    auth: { auth: async () => ({ user: { id: uuid, type: "regular" } }) },
    client: {
      createPlatformBillingClient: (input: PlatformClientOptions) =>
        createPlatformBillingClient({
          ...input,
          fetcher: (url, init) => {
            const upstream = new Request(url, init);
            requests.push(upstream);
            const { pathname } = new URL(upstream.url);
            let body: unknown = { approval, requestId: "wire" };
            if (pathname.endsWith("/dispute-reviews/execute")) {
              body = { approval, duplicate: false, requestId: "wire" };
            } else if (pathname.endsWith("/audit/export")) {
              body = { count: 0, recorded: true, requestId: "wire" };
            } else if (pathname.endsWith("/audit")) {
              body = {
                audits: [],
                hasMore: false,
                nextCursor: null,
                requestId: "wire",
                viewerAdminId: 1,
              };
            } else if (
              pathname.endsWith("/approvals") &&
              upstream.method === "GET"
            ) {
              body = {
                approvals: [],
                hasMore: false,
                nextCursor: null,
                requestId: "wire",
                viewerAdminId: 1,
              };
            } else if (pathname.endsWith("/reconcile")) {
              body = {
                capturedPoints: "0",
                decision: "release_reserved",
                operationId: "operation-1",
                requestId: "wire",
                state: "released",
              };
            } else if (pathname.endsWith("/adjust")) {
              body = {
                balancePoints: "1",
                entry: {
                  balanceAfter: "1",
                  createdAt: date,
                  deltaPoints: "1",
                  eventType: "adjustment",
                  id: 1,
                  idempotencyKey: "key-1",
                  operationId: "adjustment:key-1",
                  organization: null,
                  sessionGroupId: "admin-adjustment",
                  updatedAt: date,
                  user: 1,
                },
                idempotencyKey: "key-1",
                requestId: "wire",
              };
            } else if (pathname.endsWith("/overview")) {
              body = {
                adminRole: "admin",
                balancePoints: "0",
                capturedPoints: "0",
                nextCursor: null,
                operationCount: 0,
                organizationBalancePoints: "0",
                payment: {
                  failed: 0,
                  ignored: 0,
                  inboxCount: 0,
                  processed: 0,
                  processing: 0,
                  received: 0,
                  refundDue: 0,
                  successRate: 0,
                  webhookLagSeconds: 0,
                },
                paymentAttention: [],
                paymentCases: {
                  dueSoonOrOverdue: 0,
                  items: [],
                  total: 0,
                  withGap: 0,
                },
                personalBalancePoints: "0",
                policyCount: 0,
                recentOperations: [],
                reconcilePending: 0,
                states: {},
                walletAccounting: {
                  active: 0,
                  frozen: 0,
                  invalid: 0,
                  missing: 0,
                  staged: 0,
                },
              };
            }
            return Promise.resolve(Response.json(body));
          },
        }),
      platformResponseError,
    },
    env: {
      getEnv: () => ({
        PLATFORM_BASE_URL: "https://platform.example",
        PLATFORM_MODE: "connected",
        PLATFORM_SERVICE_TOKEN: "fixture",
      }),
    },
  };
  const modules: Record<string, unknown> = {
    "@/app/(auth)/auth": options.auth,
    "@/server/application/admin/access": options.access,
    "@/server/application/platform/client": options.client,
    "@/server/shared/env": options.env,
  };
  const output = { exports: {} as Record<string, Handler> };
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "module", "exports", compiled)(
    (name: string) =>
      modules[name] ??
      require(
        name.startsWith("@/") ? `${process.cwd()}/${name.slice(2)}` : name
      ),
    output,
    output.exports
  );
  return { GET: output.exports.GET, POST: output.exports.POST, requests };
}
function request(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  return new Request(`https://chat.example${path}`, {
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
const readers = [
  {
    invalid: [
      "?limit=0",
      "?limit=101",
      "?limit=01",
      "?limit=1e2",
      "?status=legacy",
      "?limit=1&limit=2",
      "?unknown=x",
      "?cursor=",
    ],
    path: "approvals",
    valid: "?status=pending&limit=25",
  },
  {
    invalid: [
      "?scope=typo",
      "?scope=",
      "?limit=NaN",
      "?limit=101",
      "?limit=01",
      "?action=",
      "?scope=billing&scope=billing",
      "?unknown=x",
    ],
    path: "audit",
    valid: "?scope=billing&limit=25",
  },
  {
    invalid: [
      "?limit=01",
      "?limit=1e1",
      "?state=",
      "?subjectType=legacy",
      "?limit=1&limit=2",
      "?unknown=x",
      "?cursor=",
    ],
    path: "overview",
    valid: "?state=settled&limit=20&from=2024-02-29&to=2024-02-29",
  },
  {
    invalid: [
      "?scope=typo",
      "?scope=",
      "?scope=billing&scope=billing",
      "?limit=10",
      "?cursor=x",
      "?action=",
      "?unknown=x",
    ],
    path: "audit/export",
    valid: "?scope=billing",
  },
];
for (const fixture of readers) {
  test(`actual billing ${fixture.path} rejects changed/ambiguous filters before upstream`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    for (const query of fixture.invalid) {
      // biome-ignore lint/performance/noAwaitInLoops: every raw query must fail independently without upstream calls.
      const result = await route.GET(
        request(`/api/admin/billing/${fixture.path}${query}`)
      );
      assert.equal(result.status, 400, query);
    }
    assert.equal(route.requests.length, 0);
    const valid = await route.GET(
      request(`/api/admin/billing/${fixture.path}${fixture.valid}`)
    );
    assert.equal(valid.status, 200);
    assert.equal(
      route.requests.length,
      fixture.path === "audit/export" ? 2 : 1
    );
  });
}
const writers: Array<{
  path: string;
  params: Record<string, string>;
  valid: Record<string, unknown>;
}> = [
  {
    params: {},
    path: "dispute-reviews/execute",
    valid: { approvalId: "approval-1" },
  },
  {
    params: {},
    path: "approvals",
    valid: {
      action: "wallet_adjust",
      deltaPoints: 1,
      organizationId: null,
      reason: "  verified  ",
      resourceId: "1",
    },
  },
  {
    params: { userId: "1" },
    path: "wallets/[userId]/adjust",
    valid: {
      approvalId: "approval-1",
      deltaPoints: 1,
      idempotencyKey: "key-1",
      organizationId: null,
      reason: "  verified  ",
    },
  },
  {
    params: { operationId: "operation-1" },
    path: "reconcile/[operationId]",
    valid: {
      approvalId: "approval-1",
      decision: "release_reserved",
      reason: "verified",
    },
  },
];
for (const fixture of writers) {
  test(`actual billing ${fixture.path} rejects null and unknown body without side effects`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    for (const body of [
      null,
      { ...fixture.valid, unknown: true },
      { ...fixture.valid, deltaPoints: 0.1 },
    ].slice(0, fixture.path.startsWith("reconcile") ? 2 : 3)) {
      // biome-ignore lint/performance/noAwaitInLoops: independently reject malformed wire facts.
      const response = await route.POST(
        request("/api/admin/billing/fixture", body, { "if-match": date }),
        { params: Promise.resolve(fixture.params) }
      );
      assert.equal(response.status, 400);
    }
    assert.equal(route.requests.length, 0);
    const result = await route.POST(
      request("/api/admin/billing/fixture", fixture.valid, {
        "if-match": date,
      }),
      { params: Promise.resolve(fixture.params) }
    );
    assert.equal(result.status, 200);
    const forwarded = await route.requests[0].json();
    assert.equal(forwarded.reason, fixture.valid.reason);
    if ("deltaPoints" in fixture.valid) {
      assert.equal(forwarded.deltaPoints, 1);
    }
  });
  test(`actual billing ${fixture.path} reads bounded streams and never waits for cancel`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    let pulls = 0;
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        cancel() {
          canceled = true;
          return new Promise<void>(() => {
            /* Deliberately never settles. */
          });
        },
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue(new Uint8Array(65_537));
          }
        },
      },
      { highWaterMark: 0 }
    );
    const raw = new Request("https://chat.example/api/admin/billing/fixture", {
      body: stream,
      duplex: "half",
      headers: {
        host: "chat.example",
        "if-match": date,
        origin: "https://chat.example",
      },
      method: "POST",
    } as RequestInit);
    const result = await Promise.race([
      route.POST(raw, { params: Promise.resolve(fixture.params) }),
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(new Response(null, { status: 599 })), 100)
      ),
    ]);
    assert.equal(result.status, 413);
    assert.equal(pulls, 1);
    assert.equal(canceled, true);
    assert.equal(raw.body?.locked, false);
    assert.equal(route.requests.length, 0);
  });
  test(`actual billing ${fixture.path} checks auth/origin before reading body`, async () => {
    for (const authorized of [false, true]) {
      const route = loadRoute(
        `app/api/admin/billing/${fixture.path}/route.ts`,
        authorized
      );
      let pulls = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull() {
            pulls += 1;
          },
        },
        { highWaterMark: 0 }
      );
      const raw = new Request(
        "https://chat.example/api/admin/billing/fixture",
        {
          body: stream,
          duplex: "half",
          headers: {
            host: "chat.example",
            origin: "https://elsewhere.example",
          },
          method: "POST",
        } as RequestInit
      );
      // biome-ignore lint/performance/noAwaitInLoops: authentication and origin are separate negative cases.
      const response = await Promise.race([
        route.POST(raw, { params: Promise.resolve(fixture.params) }),
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response(null, { status: 599 })), 100)
        ),
      ]);
      assert.equal(response.status, 403);
      assert.equal(pulls, 0);
      assert.equal(route.requests.length, 0);
    }
  });
}

for (const fixture of [
  ...writers,
  {
    params: { approvalId: "approval-1" },
    path: "approvals/[approvalId]/approve",
    valid: {},
  },
]) {
  test(`actual billing ${fixture.path} rejects undeclared write query before upstream`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    const response = await route.POST(
      request("/api/admin/billing/fixture?unknown=x", fixture.valid, {
        "if-match": date,
      }),
      { params: Promise.resolve(fixture.params) }
    );
    assert.equal(response.status, 400);
    assert.equal(route.requests.length, 0);
  });
}

for (const fixture of writers.filter(
  (item) => Object.keys(item.params).length > 0
)) {
  test(`actual billing ${fixture.path} rejects invalid path before body or upstream`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    const [key] = Object.keys(fixture.params);
    for (const value of ["", "x".repeat(129)]) {
      // biome-ignore lint/performance/noAwaitInLoops: each declared path boundary is independent.
      const response = await route.POST(
        request("/api/admin/billing/fixture", fixture.valid, {
          "if-match": date,
        }),
        { params: Promise.resolve({ [key]: value }) }
      );
      assert.equal(response.status, 400);
    }
    assert.equal(route.requests.length, 0);
  });
}

test("actual approve validates its path and still forwards the legitimate approval once", async () => {
  const route = loadRoute(
    "app/api/admin/billing/approvals/[approvalId]/approve/route.ts"
  );
  const response = await route.POST(request("/api/admin/billing/fixture", {}), {
    params: Promise.resolve({ approvalId: "x".repeat(129) }),
  });
  assert.equal(response.status, 400);
  assert.equal(route.requests.length, 0);
  const valid = await route.POST(request("/api/admin/billing/fixture", {}), {
    params: Promise.resolve({ approvalId: "approval-1" }),
  });
  assert.equal(valid.status, 200);
  assert.equal(route.requests.length, 1);
});

test("actual reconcile retains 412 for missing revision before reading body", async () => {
  const route = loadRoute(
    "app/api/admin/billing/reconcile/[operationId]/route.ts"
  );
  let pulls = 0;
  const raw = new Request("https://chat.example/api/admin/billing/fixture", {
    body: new ReadableStream(
      {
        pull() {
          pulls += 1;
        },
      },
      { highWaterMark: 0 }
    ),
    duplex: "half",
    headers: { host: "chat.example", origin: "https://chat.example" },
    method: "POST",
  } as RequestInit);
  const response = await route.POST(raw, {
    params: Promise.resolve({ operationId: "operation-1" }),
  });
  assert.equal(response.status, 412);
  assert.equal(pulls, 0);
  assert.equal(route.requests.length, 0);
});

test("actual wallet forwards the canonical numeric delta and prefers the declared idempotency header", async () => {
  const route = loadRoute(
    "app/api/admin/billing/wallets/[userId]/adjust/route.ts"
  );
  const result = await route.POST(
    request(
      "/api/admin/billing/fixture",
      {
        approvalId: "approval-1",
        deltaPoints: 1,
        idempotencyKey: "ignored-key",
        reason: "verified",
      },
      { "idempotency-key": "key-1" }
    ),
    { params: Promise.resolve({ userId: "1" }) }
  );
  assert.equal(result.status, 200);
  assert.equal(route.requests[0].headers.get("idempotency-key"), "key-1");
  const body = await route.requests[0].json();
  assert.equal(body.deltaPoints, 1);
});

for (const fixture of writers) {
  test(`actual billing ${fixture.path} rejects malformed UTF8 without replacement or upstream writes`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    const json = new TextEncoder().encode(
      JSON.stringify({ ...fixture.valid, reason: "x" })
    );
    const at = new TextDecoder().decode(json).lastIndexOf('"x"') + 1;
    json[at] = 255;
    const raw = new Request("https://chat.example/api/admin/billing/fixture", {
      body: json,
      headers: {
        host: "chat.example",
        "if-match": date,
        origin: "https://chat.example",
      },
      method: "POST",
    });
    const result = await route.POST(raw, {
      params: Promise.resolve(fixture.params),
    });
    assert.equal(result.status, 400);
    assert.equal(route.requests.length, 0);
    assert.deepEqual(await result.json(), { code: "INVALID_JSON" });
  });
}

for (const fixture of writers) {
  test(`actual billing ${fixture.path} cancels announced oversize without reading or waiting`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    let pulls = 0;
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        cancel() {
          canceled = true;
          return new Promise<void>(() => {
            /* Deliberately never settles. */
          });
        },
        pull() {
          pulls += 1;
        },
      },
      { highWaterMark: 0 }
    );
    const raw = new Request("https://chat.example/api/admin/billing/fixture", {
      body: stream,
      duplex: "half",
      headers: {
        "content-length": "65537",
        host: "chat.example",
        "if-match": date,
        origin: "https://chat.example",
      },
      method: "POST",
    } as RequestInit);
    const response = await route.POST(raw, {
      params: Promise.resolve(fixture.params),
    });
    assert.equal(response.status, 413);
    assert.equal(pulls, 0);
    assert.equal(canceled, true);
    assert.equal(route.requests.length, 0);
  });
  test(`actual billing ${fixture.path} accepts BOM JSON without affecting signed provider bytes`, async () => {
    const route = loadRoute(`app/api/admin/billing/${fixture.path}/route.ts`);
    const raw = new Request("https://chat.example/api/admin/billing/fixture", {
      body: new Uint8Array([
        239,
        187,
        191,
        ...new TextEncoder().encode(JSON.stringify(fixture.valid)),
      ]),
      headers: {
        host: "chat.example",
        "if-match": date,
        origin: "https://chat.example",
      },
      method: "POST",
    });
    const response = await route.POST(raw, {
      params: Promise.resolve(fixture.params),
    });
    assert.equal(response.status, 200);
    assert.equal(route.requests.length, 1);
  });
}

test("actual reconcile distinguishes unrelated header errors from revision conflicts", async () => {
  const route = loadRoute(
    "app/api/admin/billing/reconcile/[operationId]/route.ts"
  );
  const response = await route.POST(
    request(
      "/api/admin/billing/fixture",
      { decision: "release_reserved" },
      { "if-match": date, "x-request-id": "x".repeat(129) }
    ),
    { params: Promise.resolve({ operationId: "operation-1" }) }
  );
  assert.equal(response.status, 400);
  assert.equal(route.requests.length, 0);
});

test("operator may list approvals but cannot create a money-change request", async () => {
  const route = loadRoute(
    "app/api/admin/billing/approvals/route.ts",
    true,
    "operator"
  );
  const response = await route.POST(
    request("/api/admin/billing/approvals", {
      action: "wallet_adjust",
      deltaPoints: "1",
      reason: "operator negative control",
      resourceId: "1",
    })
  );
  assert.equal(response.status, 403);
  assert.equal(route.requests.length, 0);
  assert.equal(
    (
      await route.GET(
        new Request("https://chatnest.example/api/admin/billing/approvals")
      )
    ).status,
    200
  );
});
