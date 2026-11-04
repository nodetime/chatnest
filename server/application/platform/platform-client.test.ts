import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPlatformBillingClient,
  PlatformHttpError,
  platformFailure,
} from "@/server/application/platform/client";
import { PLATFORM_SCHEMA_REVISION } from "./contract-version";
import type { PlatformBillingClient } from "./protocol";

const wireDate = "2026-11-02T00:00:00.000Z";
const wireSession = {
  capturedPoints: "19999999999999999998",
  chatId: "chat-1",
  createdAt: wireDate,
  organizationId: null,
  reservedPoints: "19999999999999999998",
  runId: null,
  sessionGroupId: "chat-1",
  status: "completed",
  stepsCount: 2,
};
const wireApproval = {
  action: "reconcile",
  approvalId: "approval-1",
  approvedAt: null,
  approvedBy: null,
  consumedAt: null,
  decision: "capture_reserved",
  deltaPoints: null,
  disputeReviewSnapshot: null,
  expiresAt: wireDate,
  mutationHash: null,
  organizationId: null,
  reason: "verified",
  recoverySnapshot: null,
  requestedBy: 7,
  requestedRevision: wireDate,
  resourceId: "operation-1",
  status: "pending",
};
const wireOrganization = {
  balancePoints: "10",
  id: 7,
  name: "Fixture",
  role: "owner",
  slug: "fixture",
  status: "active",
};
const generatedResponseCases: Array<{
  name: string;
  call: (client: PlatformBillingClient) => Promise<unknown> | undefined;
  body: Record<string, unknown>;
  invalid: Record<string, unknown>[];
  projection?: string;
}> = [
  {
    body: { adminId: 7, allowed: true, requestId: "wire", role: "admin" },
    call: (client) => client.adminCapability?.(),
    invalid: [{ allowed: false }, { adminId: 0 }],
    name: "capability",
  },
  {
    body: { balancePoints: "10", requestId: "wire", sessions: [wireSession] },
    call: (client) => client.sessionList?.(),
    invalid: [
      { sessions: [{ ...wireSession, createdAt: "yesterday" }] },
      { sessions: [{ ...wireSession, organizationId: undefined }] },
      { sessions: [{ ...wireSession, status: "settling" }] },
      { sessions: [{ ...wireSession, stepsCount: -1 }] },
      { sessions: [{ ...wireSession, stepsCount: 0.5 }] },
    ],
    name: "sessions",
  },
  {
    body: { organizations: [wireOrganization], requestId: "wire" },
    call: (client) => client.organizations?.(),
    invalid: [{ organizations: [{ ...wireOrganization, status: "legacy" }] }],
    name: "organizations",
  },
  {
    body: { organization: wireOrganization, requestId: "wire" },
    call: (client) => client.createOrganization?.({ name: "Fixture" }),
    invalid: [{ organization: { ...wireOrganization, id: 0 } }],
    name: "create organization",
  },
  {
    body: { members: [], requestId: "wire" },
    call: (client) => client.listOrganizationMembers?.("7"),
    invalid: [
      {
        members: [
          { active: true, email: null, name: null, role: "root", userId: 7 },
        ],
      },
    ],
    name: "members",
  },
  {
    body: {
      member: { active: true, role: "member", userId: 8 },
      requestId: "wire",
    },
    call: (client) =>
      client.addOrganizationMember?.({ organizationId: "7", userId: 8 }),
    invalid: [{ member: { active: false, role: "owner", userId: 8 } }],
    name: "add member",
  },
  {
    body: { organizationId: null, requestId: "wire", subscriptions: [] },
    call: (client) => client.subscriptions?.(),
    invalid: [
      {
        subscriptions: [
          {
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
            currentPeriodStart: null,
            plan: null,
            provider: "fixture",
            status: "legacy",
            subscriptionId: "sub-1",
          },
        ],
      },
    ],
    name: "subscriptions",
  },
  {
    body: {
      approvals: [wireApproval],
      hasMore: false,
      nextCursor: null,
      requestId: "wire",
      viewerAdminId: 7,
    },
    call: (client) => client.listBillingApprovals?.(),
    invalid: [
      { viewerAdminId: 0 },
      { approvals: [{ ...wireApproval, expiresAt: "tomorrow" }] },
    ],
    name: "approval list",
  },
  {
    body: {
      audits: [],
      hasMore: false,
      nextCursor: null,
      requestId: "wire",
      viewerAdminId: 7,
    },
    call: (client) => client.listBillingAudit?.(),
    invalid: [{ viewerAdminId: 0 }],
    name: "audit list",
  },
  {
    body: { approval: wireApproval, requestId: "wire" },
    call: (client) =>
      client.requestBillingApproval?.({
        action: "reconcile",
        decision: "capture_reserved",
        reason: "verified",
        resourceId: "operation-1",
        revision: wireDate,
      }),
    invalid: [{ approval: { ...wireApproval, expiresAt: "tomorrow" } }],
    name: "request approval",
    projection: "approval",
  },
  {
    body: { approval: wireApproval, requestId: "wire" },
    call: (client) => client.approveBillingApproval?.("approval-1"),
    invalid: [{ approval: { ...wireApproval, expiresAt: "tomorrow" } }],
    name: "approve",
    projection: "approval",
  },
  {
    body: { count: 1, recorded: true, requestId: "wire" },
    call: (client) =>
      client.recordBillingAuditExport?.({ count: 1, scope: "billing" }),
    invalid: [{ recorded: false }, { count: 1001 }],
    name: "export",
  },
  {
    body: {
      capturedPoints: "1",
      decision: "capture_reserved",
      operationId: "operation-1",
      requestId: "wire",
      state: "settled",
    },
    call: (client) =>
      client.reconcileOperation?.({
        decision: "capture_reserved",
        operationId: "operation-1",
        revision: wireDate,
      }),
    invalid: [
      { state: "dispatching" },
      { state: "settling" },
      { state: "dispatched" },
    ],
    name: "reconcile",
  },
];

for (const fixture of generatedResponseCases) {
  test(`generated ${fixture.name} response preserves the complete wire facts`, async () => {
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: () => Promise.resolve(Response.json(fixture.body)),
      serviceToken: "fixture",
    });
    const result = fixture.call(client);
    assert.ok(result);
    assert.deepEqual(
      await result,
      fixture.projection ? fixture.body[fixture.projection] : fixture.body
    );
  });

  test(`generated ${fixture.name} response rejects missing metadata and invalid facts`, async () => {
    const missingRequestId = { ...fixture.body };
    missingRequestId.requestId = undefined;
    const missingViewerAdminId = { ...fixture.body };
    missingViewerAdminId.viewerAdminId = undefined;
    const invalidBodies = [
      missingRequestId,
      ...fixture.invalid.map((patch) => ({ ...fixture.body, ...patch })),
      { ...fixture.body, unrecognized: true },
    ];
    if ("viewerAdminId" in fixture.body) {
      invalidBodies.push(missingViewerAdminId);
    }
    for (const body of invalidBodies) {
      const client = createPlatformBillingClient({
        baseUrl: "https://platform.example",
        fetcher: () => Promise.resolve(Response.json(body)),
        serviceToken: "fixture",
      });
      // biome-ignore lint/performance/noAwaitInLoops: independently check every canonical negative wire fixture.
      await assert.rejects(async () => {
        const result = fixture.call(client);
        assert.ok(result);
        await result;
      });
    }
  });
}

test("platform failure preserves safe business status and hides transport details", () => {
  assert.deepEqual(
    platformFailure(
      new PlatformHttpError(402, "INSUFFICIENT_POINTS"),
      "BILLING_FAILED"
    ),
    { code: "INSUFFICIENT_POINTS", status: 402 }
  );
  assert.deepEqual(
    platformFailure(
      new PlatformHttpError(503, "PLATFORM_UNAVAILABLE"),
      "BILLING_FAILED"
    ),
    { code: "PLATFORM_UNAVAILABLE", status: 503 }
  );
  assert.deepEqual(
    platformFailure(new Error("secret upstream body"), "BILLING_FAILED"),
    {
      code: "BILLING_FAILED",
      status: 502,
    }
  );
});

test("platform response error projection hides generic transport details", async () => {
  const { platformResponseError } = await import(
    "@/server/application/platform/client"
  );
  const business = platformResponseError(
    new PlatformHttpError(409, "APPROVAL_REQUIRED"),
    "BILLING_FAILED"
  );
  assert.equal(business.status, 409);
  assert.deepEqual(await business.json(), { code: "APPROVAL_REQUIRED" });

  const transport = platformResponseError(
    new Error("database secret or upstream body"),
    "BILLING_FAILED"
  );
  assert.equal(transport.status, 502);
  assert.deepEqual(await transport.json(), { code: "BILLING_FAILED" });
});

test("platform client sends separated credentials without an undeclared reserve key", async () => {
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
  assert.equal(requests[0].headers.has("Idempotency-Key"), false);
  assert.equal(requests[0].headers.get("X-Platform-API-Version"), "v1");
  assert.equal(
    requests[0].headers.get("X-Platform-Schema-Revision"),
    PLATFORM_SCHEMA_REVISION
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

test("platform internal calls carry the separate internal marker", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(Response.json({ state: "released" }));
    },
    serviceToken: "service-token",
  });
  await client.reportInternal?.({
    attemptId: "attempt-1",
    operationId: "operation-1",
    outcome: "failed",
  });
  assert.equal(requests[0].headers.get("X-Platform-Internal"), "1");
  assert.equal(requests[0].headers.get("X-Platform-User-Token"), null);
});

test("platform admin calls carry the mapped external staff identity", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    adminIdentity: { issuer: "chatnest", subject: "admin-subject" },
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(Response.json({ state: "released" }));
    },
    serviceToken: "service-token",
  });
  await client.reportInternal?.({
    attemptId: "attempt-1",
    operationId: "operation-1",
    outcome: "failed",
  });
  assert.equal(requests[0].headers.get("X-Platform-Admin-Issuer"), "chatnest");
  assert.equal(
    requests[0].headers.get("X-Platform-Admin-Subject"),
    "admin-subject"
  );
});

test("platform admin capability resolves the mapped staff role", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    adminIdentity: { issuer: "chatnest", subject: "admin-subject" },
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({
          adminId: 7,
          allowed: true,
          requestId: "fixture",
          role: "operator",
        })
      );
    },
    serviceToken: "service-token",
  });
  const capability = await client.adminCapability?.();
  assert.deepEqual(capability, {
    adminId: 7,
    allowed: true,
    requestId: "fixture",
    role: "operator",
  });
  assert.match(requests[0]?.url ?? "", /\/internal\/admin\/capability$/);
  assert.equal(requests[0]?.headers.get("X-Platform-Internal"), "1");
  assert.equal(
    requests[0]?.headers.get("X-Platform-Admin-Subject"),
    "admin-subject"
  );
});

test("platform admin audit and approval queries preserve bounded cursors", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    adminIdentity: { issuer: "chatnest", subject: "admin-subject" },
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/audit")) {
        return Promise.resolve(
          Response.json({
            audits: [],
            hasMore: false,
            nextCursor: null,
            requestId: "fixture",
            viewerAdminId: 7,
          })
        );
      }
      return Promise.resolve(
        Response.json({
          approvals: [],
          hasMore: false,
          nextCursor: null,
          requestId: "fixture",
          viewerAdminId: 7,
        })
      );
    },
    serviceToken: "service-token",
  });
  await client.listBillingApprovals?.("pending", "approval-cursor", 25);
  await client.listBillingAudit?.({
    cursor: "audit-cursor",
    limit: 25,
    scope: "billing",
  });
  assert.match(requests[0]?.url ?? "", /status=pending/);
  assert.match(requests[0]?.url ?? "", /cursor=approval-cursor/);
  assert.match(requests[0]?.url ?? "", /limit=25/);
  assert.match(requests[1]?.url ?? "", /audit/);
  assert.match(requests[1]?.url ?? "", /cursor=audit-cursor/);
  assert.match(requests[1]?.url ?? "", /scope=billing/);
  assert.equal(requests[1]?.headers.get("X-Platform-Internal"), "1");
});

test("platform admin overview preserves billing metric projections", async () => {
  const client = createPlatformBillingClient({
    adminIdentity: { issuer: "chatnest", subject: "admin-subject" },
    baseUrl: "https://platform.example",
    fetcher: () =>
      Promise.resolve(
        Response.json({
          adminRole: "admin",
          balancePoints: "12",
          capturedPoints: "8",
          nextCursor: null,
          operationCount: 2,
          organizationBalancePoints: "0",
          payment: {
            failed: 1,
            ignored: 0,
            inboxCount: 0,
            processed: 3,
            processing: 0,
            received: 0,
            refundDue: 0,
            successRate: 75,
            webhookLagSeconds: 2,
          },
          paymentAttention: [],
          paymentCases: {
            dueSoonOrOverdue: 0,
            items: [],
            total: 0,
            withGap: 0,
          },
          personalBalancePoints: "12",
          policyCount: 1,
          recentOperations: [],
          reconcilePending: 0,
          states: {},
          walletAccounting: {
            active: 1,
            frozen: 0,
            invalid: 0,
            missing: 0,
            staged: 0,
          },
        })
      ),
    serviceToken: "service-token",
  });
  const overview = await client.adminOverview?.();
  assert.equal(overview?.payment.successRate, 75);
  assert.equal(overview?.personalBalancePoints, "12");
  assert.equal(overview?.capturedPoints, "8");
});

test("platform admin overview forwards operation filters", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    adminIdentity: { issuer: "chatnest", subject: "admin-subject" },
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({
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
            active: 1,
            frozen: 0,
            invalid: 0,
            missing: 0,
            staged: 0,
          },
        })
      );
    },
    serviceToken: "service-token",
  });
  await client.adminOverview?.({
    cursor: "operation-cursor",
    from: "2026-11-01",
    limit: 20,
    state: "settled",
    subjectType: "tool",
    to: "2026-11-02",
  });
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get("cursor"), "operation-cursor");
  assert.equal(url.searchParams.get("from"), "2026-11-01");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.equal(url.searchParams.get("state"), "settled");
  assert.equal(url.searchParams.get("subjectType"), "tool");
  assert.equal(url.searchParams.get("to"), "2026-11-02");
});

test("platform reconciliation carries the operation revision as If-Match", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    adminIdentity: { issuer: "chatnest", subject: "admin-subject" },
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({
          capturedPoints: "1",
          decision: "capture_reserved",
          operationId: "operation-1",
          requestId: "fixture",
          state: "settled",
        })
      );
    },
    serviceToken: "service-token",
  });
  await client.reconcileOperation?.({
    decision: "capture_reserved",
    operationId: "operation-1",
    reason: "verified",
    revision: "2026-10-31T00:00:00.000Z",
  });
  assert.equal(
    requests[0]?.headers.get("If-Match"),
    "2026-10-31T00:00:00.000Z"
  );
});

test("platform client exposes product and tenant APIs with scoped paths", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/plans?organizationId=7")) {
        return Promise.resolve(
          Response.json({
            balancePoints: "20.125",
            currency: "USD",
            organizationId: 7,
            plans: [
              {
                active: true,
                currency: "USD",
                monthlyPoints: "100.500000",
                name: "Team",
                priceCents: 1200,
                priceVersion: null,
                slug: "team",
              },
            ],
            requestId: "fixture",
            restrictedPoints: "12",
            spendablePoints: "8.125",
          })
        );
      }
      return Promise.resolve(
        Response.json({
          organizations: [
            {
              balancePoints: "20.125",
              id: 7,
              name: "Acme",
              role: "owner",
              slug: "acme",
              status: "active",
            },
          ],
          requestId: "fixture",
        })
      );
    },
    serviceToken: "service-token",
    userToken: "user-token",
  });
  const plans = await client.plans?.("7");
  const organizations = await client.organizations?.();
  assert.equal(plans?.plans[0]?.slug, "team");
  assert.equal(plans?.plans[0]?.monthlyPoints, "100.500000");
  assert.equal(plans?.spendablePoints, "8.125");
  assert.equal(plans?.restrictedPoints, "12");
  assert.equal(organizations?.organizations[0]?.id, 7);
  assert.equal(requests[0]?.headers.get("X-Platform-User-Token"), "user-token");
  assert.match(requests[0]?.url ?? "", /organizationId=7/);
});

test("platform client reads checkout status without accepting browser-supplied balance", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({
          amountCents: 1999,
          checkoutId: "checkout-1",
          createdAt: "2026-10-31T00:00:00.000Z",
          creditedPoints: "10",
          currency: "USD",
          organizationId: null,
          paymentPosition: null,
          plan: { monthlyPoints: "10", name: "Starter", slug: "starter" },
          priceVersion: "2026-10-31.1",
          refundAttention: "none",
          refundedPoints: "0",
          refundRecovery: null,
          requestId: "fixture",
          status: "pending",
          updatedAt: "2026-10-31T00:00:00.000Z",
        })
      );
    },
    serviceToken: "service-token",
    userToken: "user-token",
  });
  const result = await client.checkoutStatus?.("checkout-1");
  assert.equal(result?.status, "pending");
  assert.equal(result?.creditedPoints, "10");
  assert.equal(result?.refundAttention, "none");
  assert.match(requests[0]?.url ?? "", /payments\/checkout\/checkout-1$/);
});

test("platform client rejects legacy receipts and missing pagination instead of a second response parser", async () => {
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: () =>
      Promise.resolve(
        Response.json({
          session: {
            chatId: "chat-1",
            runId: null,
            sessionGroupId: "chat-1",
            status: "completed",
          },
          steps: [
            {
              attemptId: "attempt-1",
              canonicalToolKey: "fixture/search",
              capturedPoints: "1",
              createdAt: "2026-10-31T00:00:00.000Z",
              modelId: null,
              operationId: "operation-1",
              outcome: "response",
              receipt: { receiptId: "legacy" },
              reservedPoints: "1",
              state: "settling",
              stepIndex: 0,
              subjectType: "tool",
              updatedAt: "2026-10-31T00:00:00.000Z",
              usage: null,
            },
          ],
          totals: { capturedPoints: "1", reservedPoints: "1" },
        })
      ),
    serviceToken: "service-token",
    userToken: "user-token",
  });
  const { sessionDetails } = client;
  assert.ok(sessionDetails);
  await assert.rejects(() => sessionDetails("chat-1"));
});

test("admin overview rejects missing payment facts at the raw wire boundary", async () => {
  const complete = {
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
    paymentCases: { dueSoonOrOverdue: 0, items: [], total: 0, withGap: 0 },
    personalBalancePoints: "0",
    policyCount: 0,
    recentOperations: [],
    reconcilePending: 0,
    states: {},
    walletAccounting: {
      active: 1,
      frozen: 0,
      invalid: 0,
      missing: 0,
      staged: 0,
    },
  };
  for (const state of ["dispatching", "settling", "unknown"]) {
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: () =>
        Promise.resolve(
          Response.json({
            ...complete,
            recentOperations: [
              {
                attemptId: "attempt-1",
                canonicalToolKey: "fixture/search",
                capturedPoints: "0",
                createdAt: wireDate,
                operationId: "operation-1",
                reservedPoints: "1",
                sessionGroupId: "chat-1",
                state,
                subjectType: "tool",
                updatedAt: wireDate,
              },
            ],
          })
        ),
      serviceToken: "fixture",
    });
    // biome-ignore lint/performance/noAwaitInLoops: remote states never accept local execution phases.
    await assert.rejects(async () => client.adminOverview?.());
  }
  for (const value of [null, "0", "19999999999999999998"]) {
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: () =>
        Promise.resolve(
          Response.json({
            ...complete,
            balancePoints: value,
            personalBalancePoints: value,
          })
        ),
      serviceToken: "fixture",
    });
    // biome-ignore lint/performance/noAwaitInLoops: canonical nullable/aggregate wire fixtures.
    assert.equal((await client.adminOverview?.())?.balancePoints, value);
  }
  for (const field of [
    "refundDue",
    "inboxCount",
    "paymentAttention",
    "walletAccounting",
  ]) {
    const body = structuredClone(complete) as any;
    if (field === "paymentAttention" || field === "walletAccounting") {
      delete body[field];
    } else {
      delete body.payment[field];
    }
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: () => Promise.resolve(Response.json(body)),
      serviceToken: "fixture",
    });
    // biome-ignore lint/performance/noAwaitInLoops: independent malformed response fixtures.
    await assert.rejects(async () => client.adminOverview?.());
  }
});

test("wallet adjustment uses generated wire branches and historical replay balance", async () => {
  const entry = {
    balanceAfter: "12",
    createdAt: "2026-11-01T00:00:00.000Z",
    deltaPoints: "2",
    eventType: "adjustment",
    id: 7,
    idempotencyKey: "fixture",
    operationId: "adjustment:fixture",
    organization: null,
    sessionGroupId: "admin-adjustment",
    updatedAt: "2026-11-01T00:00:00.000Z",
    user: 2,
  };
  const input = {
    approvalId: "approved",
    deltaPoints: "2",
    idempotencyKey: "fixture",
    reason: "fixture adjustment",
    userId: "2",
  };
  for (const duplicate of [false, true]) {
    const wire = duplicate
      ? {
          duplicate: true,
          entry,
          idempotencyKey: "fixture",
          requestId: "request",
        }
      : {
          balancePoints: "12",
          entry,
          idempotencyKey: "fixture",
          requestId: "request",
        };
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: () => Promise.resolve(Response.json(wire)),
      serviceToken: "fixture",
    });
    // biome-ignore lint/performance/noAwaitInLoops: wire branch table.
    const result = await client.adjustWallet?.(input);
    assert.equal(result?.balancePoints, "12");
    assert.equal(result?.idempotencyKey, "fixture");
    assert.doesNotMatch(
      JSON.stringify(result),
      /entry|admin-adjustment|requestId/
    );
  }
  for (const malformed of [
    { ...entry, user: { id: 2, secret: "canary" } },
    { ...entry, metadata: { token: "canary" } },
    { ...entry, eventType: "reserve" },
  ]) {
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: () =>
        Promise.resolve(
          Response.json({
            balancePoints: "12",
            entry: malformed,
            idempotencyKey: "fixture",
            requestId: "request",
          })
        ),
      serviceToken: "fixture",
    });
    // biome-ignore lint/performance/noAwaitInLoops: malformed wire fixtures.
    await assert.rejects(async () => client.adjustWallet?.(input));
  }
});

test("report consumes generated terminal-state response and rejects nonterminal wire states", async () => {
  const input = {
    attemptId: "attempt",
    operationId: "operation",
    outcome: "failed" as const,
  };
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: () => Promise.resolve(Response.json({ state: "dispatched" })),
    serviceToken: "fixture",
  });
  await assert.rejects(() => client.report(input));
  const internalReport = client.reportInternal;
  assert.ok(internalReport);
  await assert.rejects(() => internalReport(input));
});

test("session detail pagination metadata survives client parsing and cursor forwarding", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({
          page: {
            hasMore: true,
            limit: 100,
            nextCursor: "cursor",
            totalSteps: 2501,
          },
          requestId: "fixture",
          session: {
            chatId: "chat",
            organizationId: null,
            runId: null,
            sessionGroupId: "group",
            status: "active",
          },
          steps: [],
          totals: { capturedPoints: "0", reservedPoints: "2501" },
        })
      );
    },
    serviceToken: "fixture",
  });
  const details = await client.sessionDetails?.("group", {
    cursor: "cursor",
    limit: 100,
  });
  assert.equal(details?.page?.totalSteps, 2501);
  assert.match(requests[0].url, /cursor=cursor/);
});

test("grant expiry client consumes the bounded generated DTO", async () => {
  await Promise.all(
    [
      { expired: -1, requestId: "fixture" },
      { expired: 0.5, requestId: "fixture" },
      { expired: 1001, requestId: "fixture" },
      { expired: 0 },
      { expired: 0, privateValue: "canary", requestId: "fixture" },
    ].map((body) => {
      const client = createPlatformBillingClient({
        baseUrl: "https://platform.example",
        fetcher: async () => Response.json(body),
        serviceToken: "fixture",
      });
      assert.ok(client.expireWalletGrants);
      return assert.rejects(client.expireWalletGrants);
    })
  );
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      const request = new Request(input, init);
      assert.equal(request.headers.get("X-Platform-Internal"), "1");
      return Promise.resolve(
        Response.json({ expired: 1000, requestId: "fixture" })
      );
    },
    serviceToken: "fixture",
  });
  assert.deepEqual(await client.expireWalletGrants?.(), {
    expired: 1000,
    requestId: "fixture",
  });
});

test("platform query transport preserves zero and empty values rather than silently broadening scope", async () => {
  const requests: Request[] = [];
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({ code: "INVALID_QUERY" }, { status: 400 })
      );
    },
    serviceToken: "fixture",
  });
  const scenarios = [
    {
      call: () => client.adminOverview?.({ cursor: "", limit: 0 }),
      expected: { cursor: "", limit: "0" },
    },
    {
      call: () => client.listBillingAudit?.({ action: "", limit: 0 }),
      expected: { action: "", limit: "0" },
    },
    {
      call: () => client.listBillingApprovals?.("pending", "", 0),
      expected: { cursor: "", limit: "0" },
    },
    {
      call: () => client.sessionDetails?.("chat-1", { cursor: "", limit: 0 }),
      expected: { cursor: "", limit: "0" },
    },
    ...[client.plans, client.sessionList, client.subscriptions].map((call) => ({
      call: () => call?.(""),
      expected: { organizationId: "" },
    })),
  ];
  for (const scenario of scenarios) {
    // biome-ignore lint/performance/noAwaitInLoops: inspect the actual rejected upstream request for each operation.
    await assert.rejects(
      async () => scenario.call(),
      (error: unknown) =>
        error instanceof PlatformHttpError && error.status === 400
    );
    const sent = new URL(requests.at(-1)?.url ?? "https://missing.invalid")
      .searchParams;
    for (const [key, value] of Object.entries(scenario.expected)) {
      assert.equal(sent.get(key), value);
    }
  }
});

test("Unicode GET identifiers use the URL, never a derived ByteString idempotency header", async () => {
  const id = "😀".repeat(129);
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (url, init) => {
      const request = new Request(url, init);
      assert.equal(
        decodeURIComponent(
          new URL(request.url).pathname.split("/").at(-1) ?? ""
        ),
        id
      );
      assert.equal(request.headers.has("Idempotency-Key"), false);
      return Promise.resolve(
        Response.json({
          amountCents: 100,
          checkoutId: id,
          createdAt: wireDate,
          creditedPoints: "0",
          currency: "USD",
          organizationId: null,
          paymentPosition: null,
          plan: null,
          priceVersion: "fixture",
          refundAttention: "none",
          refundedPoints: "0",
          refundRecovery: null,
          requestId: "fixture",
          status: "pending",
          updatedAt: wireDate,
        })
      );
    },
    serviceToken: "fixture",
  });
  assert.equal((await client.checkoutStatus?.(id))?.checkoutId, id);
});

test("Unicode organization names stay in JSON, not raw derived headers", async () => {
  const input = { name: "中文组织😀" };
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: async (url, init) => {
      const sent = new Request(url, init);
      assert.deepEqual(await sent.json(), input);
      assert.equal(sent.headers.has("Idempotency-Key"), false);
      return Response.json({
        organization: wireOrganization,
        requestId: "wire",
      });
    },
    serviceToken: "fixture",
  });
  assert.equal((await client.createOrganization?.(input))?.organization.id, 7);
});

for (const fixture of generatedResponseCases) {
  test(`nonfinancial ${fixture.name} sends no undeclared idempotency header`, async () => {
    let seen = 0;
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: (url, init) => {
        const sent = new Request(url, init);
        seen += 1;
        assert.equal(sent.headers.has("Idempotency-Key"), false);
        return Promise.resolve(Response.json(fixture.body));
      },
      serviceToken: "fixture",
    });
    await fixture.call(client);
    assert.equal(seen, 1);
  });
}
test("Unicode core IDs stay in paths/JSON and dispatch sends no undeclared body", async () => {
  const operationId = `执${"😀".repeat(127)}`;
  const attemptId = `试${"😀".repeat(127)}`;
  const received: Request[] = [];
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (url, init) => {
      const sent = new Request(url, init);
      received.push(sent);
      assert.equal(sent.headers.has("Idempotency-Key"), false);
      const path = decodeURIComponent(new URL(sent.url).pathname);
      if (path.endsWith("/reserve")) {
        return Promise.resolve(
          Response.json({ holdId: "hold", reservedPoints: "2" })
        );
      }
      assert.ok(path.includes(operationId));
      return Promise.resolve(
        Response.json(
          path.endsWith("/dispatch")
            ? { permit: "permit" }
            : { state: "reconcile_pending" }
        )
      );
    },
    serviceToken: "fixture",
  });
  await client.reserve({
    attemptId,
    operationId,
    subjectId: "user",
    tool: { api: "local", platform: "local", provider: "fixture" },
  });
  assert.equal((await received[0].json()).operationId, operationId);
  await client.dispatch({ attemptId, operationId });
  assert.equal(received[1].body, null);
  await client.report({ attemptId, operationId, outcome: "unknown" });
  assert.equal((await received[2].json()).attemptId, attemptId);
  await client.reportInternal?.({ attemptId, operationId, outcome: "unknown" });
  assert.equal((await received[3].json()).operationId, operationId);
});

test("checkout and wallet retain their actual business idempotency headers", async () => {
  const client = createPlatformBillingClient({
    baseUrl: "https://platform.example",
    fetcher: (url, init) => {
      const sent = new Request(url, init);
      assert.equal(sent.headers.get("Idempotency-Key"), "business-key");
      return Promise.resolve(
        Response.json({ code: "INVALID" }, { status: 400 })
      );
    },
    serviceToken: "fixture",
  });
  await assert.rejects(
    client.createCheckoutIntent?.({
      idempotencyKey: "business-key",
      planSlug: "plan",
    }) ?? Promise.reject(new Error("missing checkout")),
    PlatformHttpError
  );
  await assert.rejects(
    client.adjustWallet?.({
      deltaPoints: "1",
      idempotencyKey: "business-key",
      reason: "verified",
      userId: "1",
    }) ?? Promise.reject(new Error("missing wallet")),
    PlatformHttpError
  );
});

for (const refundAttention of [
  "pending",
  "review_required",
  undefined,
  "bank_succeeded",
  null,
]) {
  test(`checkout refund attention is required and exact: ${refundAttention}`, async () => {
    const body = {
      amountCents: 100,
      checkoutId: "refund-checkout",
      createdAt: wireDate,
      creditedPoints: "10",
      currency: "USD",
      organizationId: null,
      paymentPosition: null,
      plan: null,
      priceVersion: null,
      refundAttention,
      refundedPoints: "10",
      refundRecovery: null,
      requestId: "wire",
      status: "refunded",
      updatedAt: wireDate,
    };
    const client = createPlatformBillingClient({
      baseUrl: "https://platform.example",
      fetcher: () => Promise.resolve(Response.json(body)),
      serviceToken: "fixture",
    });
    if (
      refundAttention === "pending" ||
      refundAttention === "review_required"
    ) {
      assert.deepEqual(await client.checkoutStatus?.("refund-checkout"), body);
    } else {
      await assert.rejects(
        async () => await client.checkoutStatus?.("refund-checkout")
      );
    }
  });
}
