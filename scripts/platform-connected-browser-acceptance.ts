// biome-ignore-all lint/performance/noAwaitInLoops: cross-repository state transitions and viewports are intentionally sequential.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  type APIResponse,
  type BrowserContext,
  chromium,
  expect,
  type Page,
} from "@playwright/test";
import {
  ApprovalListResponseSchema,
  AuditListResponseSchema,
  BillingApprovalExecutionResponseSchema,
  BillingApprovalSchema,
  CheckoutStatusSchema,
  PaymentReconcileResponseSchema,
  PlansResponseSchema,
  SessionDetailsResponseSchema,
  SessionsResponseSchema,
  SubscriptionsResponseSchema,
} from "../server/application/platform/generated/schemas";
import { createUserPlatformClient } from "../server/application/platform/user-client";
import {
  isOwnedChatnestRuntime,
  isOwnedPayloadRuntime,
} from "./owned-payload-runtime.mjs";
import type { ConnectedFixture } from "./platform-connected-seed";

async function checkWorkerRiskLog(base: string, protectedOrder: string) {
  const result = await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    execFile(
      process.execPath,
      ["scripts/platform-settlement-worker.mjs"],
      {
        env: {
          ...process.env,
          CHATNEST_BASE_URL: base,
          CHATNEST_WORKER_TIMEOUT_MS: "45000",
          PAYMENT_RECONCILE_BATCH_SIZE: "1",
        },
        timeout: 60_000,
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== "number") {
          reject(new Error("OWNED_WORKER_ABORTED"));
        } else {
          resolve({
            code: typeof error?.code === "number" ? error.code : 0,
            stderr,
            stdout,
          });
        }
      }
    );
  });
  const summary = JSON.parse(result.stdout);
  const recovery = PaymentReconcileResponseSchema.parse(
    summary.paymentRecovery
  );
  assert(recovery.caseRisk.dueSoonOrOverdue >= 1);
  assert(recovery.caseRisk.withGap >= 1);
  const failed =
    recovery.failed > 0 ||
    summary.settlement.failed > 0 ||
    summary.settlement.deadLettered > 0;
  assert.equal(result.code, failed ? 1 : 0);
  const event = JSON.parse(result.stderr);
  assert.equal(event.code, "BILLING_ATTENTION");
  assert(event.reasons.includes("payment_case_due"));
  assert(event.reasons.includes("payment_case_gap"));
  for (const secret of [
    protectedOrder,
    process.env.CHATNEST_CONTROL_TOKEN,
    process.env.PLATFORM_SERVICE_TOKEN,
  ]) {
    if (secret) {
      assert(!result.stderr.includes(secret));
    }
  }
}

async function main() {
  const base = process.env.CONNECTED_ACCEPTANCE_BASE_URL;
  const file = process.env.CONNECTED_ACCEPTANCE_FILE;
  const password = process.env.CONNECTED_ACCEPTANCE_PASSWORD;
  assert(
    base === "http://127.0.0.1:33385" &&
      file &&
      password &&
      process.env.CHATNEST_PLATFORM_CONNECTED_ACCEPTANCE === "1" &&
      process.env.PAYLOAD_CONNECTED_ACCEPTANCE === "1" &&
      process.env.PAYLOAD_NATIVE_API_DB_ACCEPTANCE === "1" &&
      process.env.PAYLOAD_DB_PUSH === "0" &&
      process.env.PLATFORM_MODE === "connected" &&
      process.env.PLATFORM_BASE_URL === "http://127.0.0.1:3016" &&
      process.env.PAYMENT_CHECKOUT_BASE_URL ===
        "http://127.0.0.1:9/owned-fixture-checkout" &&
      isOwnedPayloadRuntime(process.env.DATABASE_URL) &&
      isOwnedChatnestRuntime(process.env.POSTGRES_URL) &&
      Boolean(process.env.PAYLOAD_PLATFORM_SERVICE_TOKEN) &&
      process.env.PLATFORM_SERVICE_TOKEN ===
        process.env.PAYLOAD_PLATFORM_SERVICE_TOKEN &&
      process.env.MODEL_PROVIDER === "openai" &&
      process.env.OPENAI_API_KEY === "connected-no-provider-key" &&
      process.env.OPENAI_BASE_URL === "http://127.0.0.1:9/v1" &&
      process.env.OPENAI_MODEL === "connected-no-model-calls",
    "OWNED_CONNECTED_BROWSER_REQUIRED"
  );
  const fixture = JSON.parse(readFileSync(file, "utf8")) as ConnectedFixture;
  assert(fixture.customerId && fixture.organizationId);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const pageErrors: string[] = [];
  let chatSubmissions = 0;
  let blockedExternalBrowserRequests = 0;
  const observations: Array<{ path: string; status: number }> = [];
  const identities: Record<string, { context: BrowserContext; page: Page }> =
    {};
  const origin = { origin: base };
  function json(response: APIResponse, expected = 200) {
    observations.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
    assert.equal(response.status(), expected, new URL(response.url()).pathname);
    return response.json();
  }
  try {
    for (const persona of fixture.personas) {
      const context = await browser.newContext();
      // No external browser request is part of this fixture's acceptance boundary.
      context.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/chat"
        ) {
          chatSubmissions += 1;
        }
      });
      await context.route("**/*", (route) => {
        const requestOrigin = new URL(route.request().url()).origin;
        if (
          requestOrigin === base ||
          requestOrigin === "http://127.0.0.1:3016"
        ) {
          return route.continue();
        }
        blockedExternalBrowserRequests += 1;
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      identities[persona.name] = { context, page };
      await page.goto(`${base}/login`);
      await page.getByLabel("邮箱", { exact: true }).fill(persona.email);
      await page.getByLabel("密码", { exact: true }).fill(password);
      await page.getByRole("button", { exact: true, name: "登录" }).click();
      await page.waitForURL((url) => !url.pathname.includes("login"));
      const session = await json(
        await context.request.get(`${base}/api/auth/session`)
      );
      assert.equal(session.user.id, persona.subject);
    }
    const { requester: a, approver: b, operator, customer } = identities;
    await json(
      await customer.context.request.get(`${base}/api/admin/billing/overview`),
      403
    );
    const operatorOverview = await json(
      await operator.context.request.get(`${base}/api/admin/billing/overview`)
    );
    assert.equal(operatorOverview.adminRole, "operator");
    await json(
      await operator.context.request.post(
        `${base}/api/admin/billing/approvals/fake/approve`,
        { headers: origin }
      ),
      403
    );
    await json(
      await operator.context.request.post(
        `${base}/api/admin/billing/approvals`,
        {
          data: {
            action: "wallet_adjust",
            deltaPoints: "1",
            reason: "operator negative control",
            resourceId: String(fixture.customerId),
          },
          headers: origin,
        }
      ),
      403
    );
    for (const path of [
      "/api/admin/billing/overview?limit=01",
      "/api/admin/billing/overview?from=2026-02-31",
      "/api/admin/billing/audit?scope=typo",
      "/api/admin/billing/approvals?limit=1&limit=2",
      "/api/admin/billing/audit/export?limit=10",
    ]) {
      await json(await a.context.request.get(`${base}${path}`), 400);
    }
    await json(
      await a.context.request.post(`${base}/api/admin/billing/approvals`, {
        data: {},
        headers: { origin: "https://elsewhere.example" },
      }),
      403
    );
    await json(
      await a.context.request.post(`${base}/api/admin/billing/approvals`, {
        data: { reason: "x".repeat(65_537) },
        headers: origin,
      }),
      413
    );
    const initial = SessionsResponseSchema.parse(
      await json(await customer.context.request.get(`${base}/api/billing`))
    );
    assert.equal(initial.balancePoints, "25");
    const plans = PlansResponseSchema.parse(
      await json(
        await customer.context.request.get(`${base}/api/billing/plans`)
      )
    );
    assert(
      plans.plans.some(
        (plan) =>
          plan.slug === fixture.planSlug &&
          plan.priceVersion === "owned-connected"
      )
    );
    const subscriptions = SubscriptionsResponseSchema.parse(
      await json(
        await customer.context.request.get(`${base}/api/billing/subscriptions`)
      )
    );
    assert(
      subscriptions.subscriptions.some(
        (subscription) =>
          subscription.status === "active" &&
          subscription.plan?.slug === fixture.planSlug
      )
    );

    assert.deepEqual(
      subscriptions.subscriptions.map((item) => item.subscriptionId),
      [fixture.issuer]
    );

    for (const [path, input] of [
      ["/api/billing/checkout", null],
      ["/api/organizations", { name: 123 }],
      ["/api/organizations/select", null],
      [`/api/organizations/${fixture.organizationId}/members`, null],
    ] as const) {
      await json(
        await customer.context.request.post(`${base}${path}`, {
          data: JSON.stringify(input),
          headers: { ...origin, "content-type": "application/json" },
        }),
        400
      );
      await json(
        await customer.context.request.post(`${base}${path}`, {
          data: input,
          headers: { origin: "https://elsewhere.example" },
        }),
        403
      );
    }
    for (const path of [
      "/api/billing",
      "/api/billing/plans",
      "/api/billing/subscriptions",
    ]) {
      await json(
        await customer.context.request.get(
          `${base}${path}?organizationId=&organizationId=7`
        ),
        400
      );
    }
    await json(
      await customer.context.request.post(`${base}/api/billing/checkout`, {
        data: { planSlug: "😀".repeat(65) },
        headers: origin,
      }),
      404
    );

    assert(fixture.organizationName);
    await json(
      await customer.context.request.post(`${base}/api/organizations`, {
        data: { name: fixture.organizationName },
        headers: origin,
      }),
      409
    );
    // Full real UI request/approve/execute; the approving user reloads all facts from the server.
    await a.page.goto(`${base}/admin/billing`);
    await operator.page.goto(`${base}/admin/billing`);
    await expect(
      operator.page.getByRole("button", { exact: true, name: "提交调账申请" })
    ).toHaveCount(0);
    const requestPath = `${base}/api/admin/billing/approvals`;
    let formSubmissions = 0;
    a.page.on("request", (request) => {
      if (request.url() === requestPath && request.method() === "POST") {
        formSubmissions += 1;
      }
    });
    await a.page
      .getByLabel("调账用户编号", { exact: true })
      .fill(String(fixture.customerId));
    await a.page.getByLabel("调账积分", { exact: true }).fill("0.0000001");
    await a.page
      .getByLabel("调账原因", { exact: true })
      .fill("owned connected wallet adjustment");
    await a.page
      .getByRole("button", { exact: true, name: "提交调账申请" })
      .click();
    await expect(
      a.page.getByRole("form", { name: "钱包调账申请" }).getByRole("alert")
    ).toContainText("请检查用户编号");
    assert.equal(formSubmissions, 0);
    await a.page.getByLabel("调账积分", { exact: true }).fill("5");
    const createdResponse = a.page.waitForResponse(
      (response) =>
        response.url() === requestPath && response.request().method() === "POST"
    );
    await a.page
      .getByRole("button", { exact: true, name: "提交调账申请" })
      .click();
    const created = await createdResponse;
    assert.equal(created.status(), 200);
    const walletApproval = BillingApprovalSchema.parse(
      (await created.json()).approval
    );
    assert.equal(walletApproval.deltaPoints, "5");
    assert.equal(walletApproval.organizationId, null);
    assert.equal(formSubmissions, 1);
    fixture.walletApprovalId = walletApproval.approvalId;
    fixture.adjustmentKey = `wallet-adjust:${walletApproval.approvalId}`;
    writeFileSync(file, JSON.stringify(fixture), { mode: 0o600 });
    await json(
      await a.context.request.post(
        `${base}/api/admin/billing/approvals/${walletApproval.approvalId}/approve`,
        { headers: origin }
      ),
      409
    );
    await b.page.goto(`${base}/admin/billing`);
    let walletCard = b.page.locator(
      `[data-approval-record-id="${walletApproval.approvalId}"]`
    );
    await expect(walletCard).toContainText("调整积分：5");
    await expect(walletCard).toContainText(`用户编号：${fixture.customerId}`);
    const walletApprovedResponse = b.page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/approvals/${walletApproval.approvalId}/approve`) &&
        response.request().method() === "POST"
    );
    await walletCard
      .getByRole("button", { exact: true, name: "允许处理" })
      .click();
    assert.equal((await walletApprovedResponse).status(), 200);
    await b.page.reload();
    walletCard = b.page.locator(
      `[data-approval-record-id="${walletApproval.approvalId}"]`
    );
    await expect(
      walletCard.getByRole("button", { exact: true, name: "确认并处理" })
    ).toBeVisible();
    await expect(walletCard).toContainText(walletApproval.requestedRevision);
    await b.page.screenshot({
      fullPage: true,
      path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/wallet-approved-status.png`,
    });
    const walletInput = {
      approvalId: walletApproval.approvalId,
      deltaPoints: "5",
      idempotencyKey: fixture.adjustmentKey,
      organizationId: null,
      reason: walletApproval.reason,
    };
    const adjustmentPath = `${base}/api/admin/billing/wallets/${fixture.customerId}/adjust`;
    await json(
      await a.context.request.post(adjustmentPath, {
        data: walletInput,
        headers: origin,
      }),
      403
    );
    for (const fields of [
      { reason: "different unapproved reason" },
      { deltaPoints: "6" },
      { organizationId: fixture.organizationId },
    ]) {
      await json(
        await b.context.request.post(adjustmentPath, {
          data: { ...walletInput, ...fields },
          headers: origin,
        }),
        409
      );
    }
    // First actual commit's response is lost; retry from the same UI uses exactly the same approval-derived key.
    const attempts: Array<{ body: unknown; duplicate: boolean }> = [];
    await b.page.route(adjustmentPath, async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      const result = await response.json();
      attempts.push({
        body: route.request().postDataJSON(),
        duplicate: result.duplicate === true,
      });
      if (attempts.length === 1) {
        await route.abort();
      } else {
        await route.fulfill({ response });
      }
    });
    await walletCard
      .getByRole("button", { exact: true, name: "确认并处理" })
      .click();
    await expect(
      b.page.getByText("执行结果暂未确认，请重试本申请或刷新核对。", {
        exact: true,
      })
    ).toBeVisible();
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].duplicate, false);
    await walletCard
      .getByRole("button", { exact: true, name: "确认并处理" })
      .click();
    await expect(walletCard).toHaveCount(0);
    await b.page.unroute(adjustmentPath);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].duplicate, true);
    assert.deepEqual(attempts[0].body, walletInput);
    assert.deepEqual(attempts[1].body, walletInput);
    const duplicate = await json(
      await b.context.request.post(adjustmentPath, {
        data: walletInput,
        headers: origin,
      })
    );
    assert.equal(duplicate.balancePoints, "30");
    assert.equal(duplicate.duplicate, true);

    const organizationAdjustmentKeys: string[] = [];
    for (const [deltaPoints, expectedBalance] of [
      ["2", "9"],
      ["-2", "7"],
    ] as const) {
      await a.page.reload();
      await a.page
        .getByLabel("调账用户编号", { exact: true })
        .fill(String(fixture.customerId));
      await a.page
        .getByLabel("调账组织编号（可选）", { exact: true })
        .fill(String(fixture.organizationId));
      await a.page.getByLabel("调账积分", { exact: true }).fill(deltaPoints);
      await a.page
        .getByLabel("调账原因", { exact: true })
        .fill(`owned organization adjustment ${deltaPoints}`);
      const orgCreatedResponse = a.page.waitForResponse(
        (response) =>
          response.url() === requestPath &&
          response.request().method() === "POST"
      );
      await a.page
        .getByRole("button", { exact: true, name: "提交调账申请" })
        .click();
      const orgResponse = await orgCreatedResponse;
      assert.equal(orgResponse.status(), 200);
      const approval = BillingApprovalSchema.parse(
        (await orgResponse.json()).approval
      );
      assert.equal(approval.organizationId, fixture.organizationId);
      assert.equal(approval.deltaPoints, deltaPoints);
      await b.page.reload();
      const card = b.page.locator(
        `[data-approval-record-id="${approval.approvalId}"]`
      );
      await expect(card).toContainText(`组织钱包：${fixture.organizationId}`);
      await card.getByRole("button", { exact: true, name: "允许处理" }).click();
      await card
        .getByRole("button", { exact: true, name: "确认并处理" })
        .waitFor();
      const executed = b.page.waitForResponse(
        (response) =>
          response.url() === adjustmentPath &&
          response.request().method() === "POST"
      );
      await card
        .getByRole("button", { exact: true, name: "确认并处理" })
        .click();
      const result = await executed;
      assert.equal(result.status(), 200);
      assert.equal((await result.json()).balancePoints, expectedBalance);
      await expect(card).toHaveCount(0);
      organizationAdjustmentKeys.push(`wallet-adjust:${approval.approvalId}`);
    }
    fixture.organizationAdjustmentKeys = organizationAdjustmentKeys;
    writeFileSync(file, JSON.stringify(fixture), { mode: 0o600 });

    // A real protocol lifecycle, explicitly no model invocation and no claimed model success.
    const persona = fixture.personas.find(
      (person) => person.name === "customer"
    );
    assert(persona);
    const client = await createUserPlatformClient({ id: persona.subject });
    assert(client);
    await client.reserve({
      attemptId: fixture.attemptId,
      modelId: fixture.modelId,
      operationId: fixture.operationId,
      sessionGroupId: fixture.groupId,
      subjectId: persona.subject,
      subjectType: "model",
      tool: {
        api: "no-model-call",
        platform: "connected",
        provider: "fixture",
      },
    });
    const dispatched = await client.dispatch({
      attemptId: fixture.attemptId,
      operationId: fixture.operationId,
    });
    assert(dispatched.permit);
    await client.report({
      attemptId: fixture.attemptId,
      operationId: fixture.operationId,
      outcome: "unknown",
    });
    const pending = SessionsResponseSchema.parse(
      await json(await customer.context.request.get(`${base}/api/billing`))
    );
    assert.equal(pending.balancePoints, "28");
    const pendingDetails = SessionDetailsResponseSchema.parse(
      await json(
        await customer.context.request.get(
          `${base}/api/billing?sessionGroupId=${fixture.groupId}`
        )
      )
    );
    assert.equal(pendingDetails.steps[0].state, "reconcile_pending");
    await a.page.goto(`${base}/admin/billing`);
    const release = a.page.locator(
      `[data-operation-id="${fixture.operationId}"][data-decision="release_reserved"]`
    );
    await expect(release).toBeVisible();
    const requestedResponse = a.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/admin/billing/approvals" &&
        response.request().method() === "POST"
    );
    await release.click();
    const requested = await requestedResponse;
    assert.equal(requested.status(), 200);
    const releaseApproval = BillingApprovalSchema.parse(
      (await requested.json()).approval
    );
    const selfPending = a.page.locator(
      `[data-approval-record-id="${releaseApproval.approvalId}"]`
    );
    await expect(
      selfPending.getByText("等待另一位管理员审批", { exact: true })
    ).toBeVisible();
    await expect(
      selfPending.getByRole("button", { exact: true, name: "允许处理" })
    ).toHaveCount(0);
    await b.page.getByRole("button", { exact: true, name: "刷新数据" }).click();
    const approve = b.page.locator(
      `[data-approval-id="${releaseApproval.approvalId}"]`
    );
    await expect(approve).toHaveText("允许处理");
    const approvedResponse = b.page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/approvals/${releaseApproval.approvalId}/approve`) &&
        response.request().method() === "POST"
    );
    await approve.click();
    assert.equal((await approvedResponse).status(), 200);
    await a.page.getByRole("button", { exact: true, name: "刷新数据" }).click();
    const requesterCard = a.page.locator(
      `[data-approval-record-id="${releaseApproval.approvalId}"]`
    );
    await expect(
      requesterCard.getByText("等待审批管理员执行", { exact: true })
    ).toBeVisible();
    await expect(
      requesterCard.getByRole("button", { exact: true, name: "确认并处理" })
    ).toHaveCount(0);
    const execute = b.page.locator(
      `[data-approval-id="${releaseApproval.approvalId}"]`
    );
    await expect(execute).toHaveText("确认并处理");
    await json(
      await a.context.request.post(
        `${base}/api/admin/billing/reconcile/${fixture.operationId}`,
        {
          data: {
            approvalId: releaseApproval.approvalId,
            decision: "release_reserved",
          },
          headers: { ...origin, "if-match": releaseApproval.requestedRevision },
        }
      ),
      403
    );
    const executedResponse = b.page.waitForResponse(
      (response) =>
        decodeURIComponent(new URL(response.url()).pathname) ===
          `/api/admin/billing/reconcile/${fixture.operationId}` &&
        response.request().method() === "POST"
    );
    await execute.click();
    assert.equal((await executedResponse).status(), 200);
    const released = SessionDetailsResponseSchema.parse(
      await json(
        await customer.context.request.get(
          `${base}/api/billing?sessionGroupId=${fixture.groupId}`
        )
      )
    );
    assert.equal(released.steps[0].state, "released");
    assert.equal(
      SessionsResponseSchema.parse(
        await json(await customer.context.request.get(`${base}/api/billing`))
      ).balancePoints,
      "30"
    );
    const consumed = ApprovalListResponseSchema.parse(
      await json(
        await a.context.request.get(
          `${base}/api/admin/billing/approvals?status=consumed&limit=100`
        )
      )
    );
    assert(
      consumed.approvals.some(
        (approval) => approval.approvalId === releaseApproval.approvalId
      )
    );
    const exportAuditUrl = `${base}/api/admin/billing/audit?scope=billing&action=billing.audit.exported&limit=100`;
    const beforeExports = AuditListResponseSchema.parse(
      await json(await a.context.request.get(exportAuditUrl))
    );
    const beforeExportIds = new Set(
      beforeExports.audits.map((audit) => audit.id)
    );
    const exported = await a.context.request.get(
      `${base}/api/admin/billing/audit/export?scope=billing`
    );
    assert.equal(exported.status(), 200);
    const csv = await exported.text();
    assert.match(csv, /时间.*动作/);
    // The owned fixture's five CSV fields contain no embedded line breaks.
    const exportedRowCount = csv.trimEnd().split("\n").length - 1;
    const afterExports = AuditListResponseSchema.parse(
      await json(await a.context.request.get(exportAuditUrl))
    );
    const freshExports = afterExports.audits.filter(
      (audit) => !beforeExportIds.has(audit.id)
    );
    assert.equal(freshExports.length, 1);
    const [freshExport] = freshExports;
    assert.equal(freshExport.resourceType, "billing-audit-export");
    assert.equal(freshExport.actorIssuer, fixture.issuer);
    assert.equal(
      freshExport.actorSubject,
      fixture.personas.find((person) => person.name === "requester")?.subject
    );
    assert.equal(freshExport.summary?.count, exportedRowCount);
    assert.equal(freshExport.summary?.scope, "billing");
    for (const viewer of [a, operator]) {
      const visible = AuditListResponseSchema.parse(
        await json(await viewer.context.request.get(exportAuditUrl))
      );
      assert(visible.audits.some((audit) => audit.id === freshExport.id));
      await viewer.page.reload();
      await expect(
        viewer.page.getByText("导出账务审计", { exact: true }).first()
      ).toBeVisible();
    }

    // Both real cookie scopes must work, and membership must remain authoritative.
    const organizations = await json(
      await customer.context.request.get(`${base}/api/organizations`)
    );
    assert(
      organizations.organizations.some(
        (organization: { id: number }) =>
          organization.id === fixture.organizationId
      )
    );
    await json(
      await customer.context.request.post(`${base}/api/organizations/select`, {
        data: { organizationId: fixture.organizationId },
        headers: origin,
      })
    );
    assert.equal(
      SessionsResponseSchema.parse(
        await json(await customer.context.request.get(`${base}/api/billing`))
      ).balancePoints,
      "7"
    );
    const explicitPersonal = SessionsResponseSchema.parse(
      await json(
        await customer.context.request.get(
          `${base}/api/billing?organizationId=`
        )
      )
    );
    assert.equal(explicitPersonal.balancePoints, "30");
    const personalPlans = PlansResponseSchema.parse(
      await json(
        await customer.context.request.get(
          `${base}/api/billing/plans?organizationId=`
        )
      )
    );
    assert.equal(personalPlans.balancePoints, "30");
    assert.equal(personalPlans.spendablePoints, "30");
    assert.equal(personalPlans.restrictedPoints, "0");
    await customer.page.goto(`${base}/account/billing`);
    await expect(
      customer.page.getByRole("main").getByTestId("billing-spendable-points")
    ).toHaveText("30");
    await expect(
      customer.page.getByText("Connected fixture plan", { exact: true })
    ).toHaveCount(2);
    const scopedSubscriptions = SubscriptionsResponseSchema.parse(
      await json(
        await customer.context.request.get(
          `${base}/api/billing/subscriptions?organizationId=${fixture.organizationId}`
        )
      )
    );
    assert.deepEqual(
      scopedSubscriptions.subscriptions.map((item) => item.subscriptionId),
      [`${fixture.issuer}:organization`]
    );
    const checkoutScopeIds: string[] = [];
    for (const [scope, expected] of [
      [{ organizationId: null }, null],
      [{ organizationId: "" }, null],
      [{}, fixture.organizationId],
    ] as const) {
      const intent = await json(
        await customer.context.request.post(`${base}/api/billing/checkout`, {
          data: { planSlug: fixture.planSlug, ...scope },
          headers: origin,
        }),
        201
      );
      assert.equal(intent.organizationId, expected);
      assert.equal(new URL(intent.checkoutUrl).origin, "http://127.0.0.1:9");
      checkoutScopeIds.push(intent.checkoutId);
      const status = await json(
        await customer.context.request.get(
          `${base}/api/billing/checkout/status?checkoutId=${encodeURIComponent(intent.checkoutId)}`
        )
      );
      assert.equal(status.organizationId, expected);
      assert.equal(status.creditedPoints, "0");
    }
    assert.equal(new Set(checkoutScopeIds).size, 3);
    fixture.checkoutScopeIds = checkoutScopeIds;
    writeFileSync(file, JSON.stringify(fixture), { mode: 0o600 });
    await json(
      await customer.context.request.post(`${base}/api/organizations/select`, {
        data: { organizationId: 2_147_483_647 },
        headers: origin,
      }),
      403
    );
    await json(
      await customer.context.request.post(`${base}/api/organizations/select`, {
        data: { organizationId: null },
        headers: origin,
      })
    );
    assert.equal(
      SessionsResponseSchema.parse(
        await json(await customer.context.request.get(`${base}/api/billing`))
      ).balancePoints,
      "30"
    );

    for (const width of [1440, 390]) {
      for (const [label, owner, path] of [
        ["account", customer, "/account"],
        ["billing", customer, "/account/billing"],
        ["usage", customer, "/account/usage"],
        ["organizations", customer, "/account/organizations"],
        ["admin", a, "/admin/billing"],
        ["operator", operator, "/admin/billing"],
      ] as const) {
        await owner.page.setViewportSize({ height: 1000, width });
        await owner.page.goto(`${base}${path}`);
        await expect(owner.page.locator("h1").first()).toBeVisible();
        assert.equal(new URL(owner.page.url()).pathname, path);
        if (label === "account") {
          await expect(
            owner.page.getByText("已更新", { exact: true })
          ).toBeVisible();
          await expect(
            owner.page.getByText("30", { exact: true })
          ).toBeVisible();
        }
        if (label === "billing") {
          const labels = owner.page.getByText("Connected fixture plan", {
            exact: true,
          });
          await expect(labels).toHaveCount(2);
          await expect(labels.first()).toBeVisible();
          await expect(
            owner.page.getByRole("main").getByTestId("billing-spendable-points")
          ).toHaveText("30");
        }
        if (label === "usage") {
          await expect(
            owner.page
              .locator(`[data-session-group-id="${fixture.groupId}"]`)
              .first()
          ).toBeVisible();
        }
        if (label === "admin" || label === "operator") {
          await expect(
            owner.page.getByRole("button", { exact: true, name: "刷新数据" })
          ).toBeVisible();
          await expect(
            owner.page.getByText("导出账务审计", { exact: true }).first()
          ).toBeVisible();
          await expect(owner.page.getByText(/读取中/)).toHaveCount(0);
        }
        if (label === "organizations") {
          assert(fixture.organizationName);
          await expect(
            owner.page
              .getByText(fixture.organizationName, { exact: true })
              .first()
          ).toBeVisible();
        }
        await owner.page.screenshot({
          fullPage: true,
          path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/${label}-${width}.png`,
        });
        assert(
          await owner.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          ),
          `${label} horizontal overflow ${width}`
        );
      }
    }
    assert(fixture.unknownSnapshotCheckoutId);
    const unknownStatus = CheckoutStatusSchema.parse(
      await json(
        await customer.context.request.get(
          `${base}/api/billing/checkout/status?checkoutId=${encodeURIComponent(fixture.unknownSnapshotCheckoutId)}`
        )
      )
    );
    assert.equal(unknownStatus.status, "refunded");
    assert.equal(unknownStatus.refundAttention, "none");
    assert.equal(unknownStatus.plan, null);
    assert.equal(unknownStatus.paymentPosition, null);
    assert.equal(unknownStatus.creditedPoints, "5");
    assert.equal(unknownStatus.refundedPoints, "5");
    for (const width of [1440, 390]) {
      await customer.page.setViewportSize({ height: 1000, width });
      await customer.page.goto(
        `${base}/account/billing/return?checkoutId=${encodeURIComponent(fixture.unknownSnapshotCheckoutId)}`
      );
      const returnMain = customer.page.getByRole("main");
      await expect(returnMain).toHaveCount(1);
      await expect(
        returnMain.getByText("支付状态", { exact: true })
      ).toBeVisible();
      await expect(
        returnMain.getByText("已退款", { exact: true })
      ).toBeVisible();
      await expect(
        returnMain.getByText("暂无方案", { exact: true })
      ).toBeVisible();
      await expect(returnMain.getByText("5", { exact: true })).toHaveCount(2);
      await customer.page.screenshot({
        fullPage: true,
        path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/unknown-snapshot-return-${width}.png`,
      });
      assert(
        await customer.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
    }
    assert(fixture.refundAttentionCheckouts);
    const caseCheckout = fixture.refundAttentionCheckouts.review_required;
    await a.page.setViewportSize({ height: 1000, width: 390 });
    await a.page.goto(`${base}/admin/billing`);
    const caseRow = a.page.locator(
      `[data-payment-case-checkout="${caseCheckout}"]`
    );
    await expect(caseRow).toContainText("原付款待核");
    await expect(caseRow).toContainText(/最早已观察应答期限：\d{4}-/);
    await a.page.screenshot({
      fullPage: true,
      path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/payment-open-cases-390.png`,
    });
    const restrictedPlans = PlansResponseSchema.parse(
      await json(
        await a.context.request.get(`${base}/api/billing/plans?organizationId=`)
      )
    );
    assert.equal(restrictedPlans.balancePoints, "100");
    assert.equal(restrictedPlans.spendablePoints, "0");
    assert.equal(restrictedPlans.restrictedPoints, "100");
    for (const width of [1440, 390]) {
      await a.page.setViewportSize({ height: 1000, width });
      await a.page.goto(`${base}/account/billing`);
      const billingMain = a.page.getByRole("main");
      await expect(
        billingMain.getByTestId("billing-spendable-points")
      ).toHaveText("0");
      await expect(
        billingMain.getByTestId("billing-balance-points")
      ).toHaveText("100");
      await expect(
        billingMain.getByTestId("billing-restricted-points")
      ).toHaveText("100");
      assert(
        await a.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
      await a.page.screenshot({
        fullPage: true,
        path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/billing-restricted-${width}.png`,
      });
    }
    for (const [attention, checkoutId] of Object.entries(
      fixture.refundAttentionCheckouts
    )) {
      const url = `${base}/api/billing/checkout/status?checkoutId=${encodeURIComponent(checkoutId)}`;
      await json(await customer.context.request.get(url), 403);
      const projection = CheckoutStatusSchema.parse(
        await json(await a.context.request.get(url))
      );
      assert.equal(projection.refundAttention, attention);
      assert.equal(
        projection.status,
        attention === "pending" ? "completed" : "refunded"
      );
      assert.equal(projection.creditedPoints, "100");
      assert.deepEqual(projection.paymentPosition, {
        consumedPoints: "0",
        disputedPoints: "0",
        expiredPoints: "0",
        heldPoints: "0",
        restrictedPoints: attention === "pending" ? "100" : "0",
        reviewRequired: true,
        spendablePoints: "0",
      });
      assert.equal(
        projection.refundedPoints,
        attention === "pending" ? "0" : "100"
      );
      for (const width of [1440, 390]) {
        await a.page.setViewportSize({ height: 1000, width });
        await a.page.goto(
          `${base}/account/billing/return?checkoutId=${encodeURIComponent(checkoutId)}`
        );
        const refundMain = a.page.getByRole("main");
        await expect(
          refundMain.getByText(
            attention === "pending" ? "退款正在处理" : "退款状态待核实",
            { exact: true }
          )
        ).toBeVisible();
        await expect(
          refundMain.getByText("账务记录状态", { exact: true })
        ).toBeVisible();
        await expect(
          refundMain.getByText("已应用退款积分", { exact: true })
        ).toBeVisible();
        await expect(
          refundMain.getByText("本单争议待核实", { exact: false })
        ).toBeVisible();
        await expect(
          refundMain.getByTestId("checkout-restrictedPoints")
        ).toHaveText(attention === "pending" ? "100" : "0");
        await expect(
          refundMain.getByText(attention === "pending" ? "已到账" : "已退款", {
            exact: true,
          })
        ).toBeVisible();
        if (attention === "review_required") {
          await expect(refundMain.getByRole("alert")).toContainText(
            "不代表银行当前到账结果"
          );
        }
        await a.page.screenshot({
          fullPage: true,
          path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/refund-${attention}-${width}.png`,
        });
        assert(
          await a.page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          )
        );
      }
      const { requestId: _beforeRequestId, ...beforeRead } = projection;
      const { requestId: _afterRequestId, ...afterRead } =
        CheckoutStatusSchema.parse(
          await json(await a.context.request.get(url))
        );
      assert.deepEqual(afterRead, beforeRead);
    }
    // 新公开退款恢复：真实C/Admin浏览器 → BFF → 非owner Payload → owned HTTP银行shape → 同一kernel。
    assert(fixture.refundRecoveryEventId && fixture.refundAttentionCheckouts);
    await a.page.goto(`${base}/admin/billing`);
    const recoveryCard = a.page.locator(
      `[data-payment-event-id="${fixture.refundRecoveryEventId}"]`
    );
    await recoveryCard
      .getByText("核验返款并申请恢复原额度", { exact: true })
      .click();
    await recoveryCard
      .getByLabel("客户选择凭证编号")
      .fill("CASE-CONNECTED-CUSTOMER-CHOICE");
    await recoveryCard
      .getByLabel("恢复原因", { exact: true })
      .fill("已核实本地客户选择恢复原额度");
    await recoveryCard
      .getByLabel("客户已明确选择恢复原额度，凭证已核验")
      .check();
    const recoveryRequested = a.page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/admin/billing/approvals" &&
        r.request().method() === "POST"
    );
    await recoveryCard
      .getByRole("button", { exact: true, name: "核验并提交恢复申请" })
      .click();
    const recoveryRequest = await recoveryRequested;
    assert.equal(recoveryRequest.status(), 200);
    const recoveryApproval = BillingApprovalSchema.parse(
      (await recoveryRequest.json()).approval
    );
    assert.equal(
      recoveryApproval.recoverySnapshot?.checkoutId,
      fixture.refundAttentionCheckouts.review_required
    );
    assert.equal(recoveryApproval.recoverySnapshot?.recoveredPoints, "0");
    assert.equal(
      recoveryApproval.recoverySnapshot?.lossPosition
        ?.transferredToDisputePoints,
      "100"
    );
    assert.equal(recoveryApproval.recoverySnapshot?.walletDeltaPoints, "0");
    await b.page.goto(`${base}/admin/billing`);
    for (const width of [1440, 390]) {
      await b.page.setViewportSize({ height: 1000, width });
      await expect(
        b.page.locator(
          `[data-approval-record-id="${recoveryApproval.approvalId}"]`
        )
      ).toContainText("到期部分：0");
      await expect(
        b.page.locator(
          `[data-approval-record-id="${recoveryApproval.approvalId}"]`
        )
      ).toContainText("转入拒付：100");
      await b.page.screenshot({
        fullPage: true,
        path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/refund-recovery-approval-${width}.png`,
      });
      assert(
        await b.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
    }
    const recoveryApproveResponse = b.page.waitForResponse(
      (r) =>
        r.url().includes(`/approvals/${recoveryApproval.approvalId}/approve`) &&
        r.request().method() === "POST"
    );
    await b.page
      .locator(`[data-approval-id="${recoveryApproval.approvalId}"]`)
      .click();
    assert.equal((await recoveryApproveResponse).status(), 200);
    const recoveryPath = `${base}/api/admin/billing/refund-recoveries/execute`;
    for (const invalid of [
      null,
      [],
      {},
      { approvalId: "" },
      { amountMinor: 100, approvalId: recoveryApproval.approvalId },
    ]) {
      await json(
        await b.context.request.post(recoveryPath, {
          data: invalid,
          headers: origin,
        }),
        400
      );
    }
    await json(
      await b.context.request.post(`${recoveryPath}?unexpected=1`, {
        data: { approvalId: recoveryApproval.approvalId },
        headers: origin,
      }),
      400
    );

    for (const identity of [a, operator, customer]) {
      await json(
        await identity.context.request.post(recoveryPath, {
          data: { approvalId: recoveryApproval.approvalId },
          headers: origin,
        }),
        403
      );
    }
    await json(
      await b.context.request.post(recoveryPath, {
        data: { approvalId: recoveryApproval.approvalId },
        headers: { origin: "https://elsewhere.example" },
      }),
      403
    );
    const recoveryExecute = b.page.locator(
      `[data-approval-id="${recoveryApproval.approvalId}"]`
    );
    await expect(recoveryExecute).toHaveText("确认并处理");
    const recoveryExecuted = b.page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
        "/api/admin/billing/refund-recoveries/execute"
    );
    await recoveryExecute.click();
    const recoveryResponse = await recoveryExecuted;
    assert.equal(recoveryResponse.status(), 200);
    assert.equal(
      BillingApprovalExecutionResponseSchema.parse(
        await recoveryResponse.json()
      ).duplicate,
      false
    );
    assert.equal(
      BillingApprovalExecutionResponseSchema.parse(
        await json(
          await b.context.request.post(recoveryPath, {
            data: { approvalId: recoveryApproval.approvalId },
            headers: origin,
          })
        )
      ).duplicate,
      true
    );
    const recoveredStatusPath = `${base}/api/billing/checkout/status?checkoutId=${encodeURIComponent(fixture.refundAttentionCheckouts.review_required)}`;
    const recovered = CheckoutStatusSchema.parse(
      await json(await a.context.request.get(recoveredStatusPath))
    );
    assert.equal(recovered.refundAttention, "none");
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.refundedPoints, "0");
    assert.equal(recovered.paymentPosition?.reviewRequired, true);
    assert.equal(recovered.paymentPosition?.disputedPoints, "100");
    assert.deepEqual(recovered.refundRecovery, {
      availablePoints: "0",
      decisions: 1,
      expiredPoints: "0",
      recoveredPoints: "0",
    });
    for (const width of [1440, 390]) {
      await a.page.setViewportSize({ height: 1000, width });
      await a.page.goto(
        `${base}/account/billing/return?checkoutId=${encodeURIComponent(fixture.refundAttentionCheckouts.review_required)}`
      );
      await expect(a.page.getByRole("main")).toContainText("现金退款未成功");
      await expect(
        a.page.getByRole("main").getByTestId("checkout-disputedPoints")
      ).toHaveText("100");
      await expect(a.page.getByRole("main")).toContainText("恢复时已过期：0");
      await a.page.screenshot({
        fullPage: true,
        path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/refund-recovery-return-${width}.png`,
      });
      assert(
        await a.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
    }
    assert(fixture.paymentCaseGapCheckout);
    await checkWorkerRiskLog(base, fixture.paymentCaseGapCheckout);
    assert(fixture.disputeReviewCheckout);
    const reviewCheckout = encodeURIComponent(fixture.disputeReviewCheckout);
    const reviewStatusPath = `${base}/api/billing/checkout/status?checkoutId=${reviewCheckout}`;
    const beforeReview = CheckoutStatusSchema.parse(
      await json(await b.context.request.get(reviewStatusPath))
    );
    assert.equal(beforeReview.paymentPosition?.restrictedPoints, "6");
    assert.equal(beforeReview.paymentPosition?.spendablePoints, "0");
    assert.equal(beforeReview.paymentPosition?.disputedPoints, "4");
    await json(await customer.context.request.get(reviewStatusPath), 403);
    await a.page.goto(`${base}/admin/billing`);
    const reviewRow = a.page.locator(
      `[data-payment-case-checkout="${fixture.disputeReviewCheckout}"]`
    );
    await reviewRow.getByText("申请解除额度限制", { exact: true }).click();
    await reviewRow
      .getByLabel("人工核查凭证编号")
      .fill("CASE-CONNECTED-DISPUTE");
    await reviewRow.getByLabel("核查原因").fill("已核对本地已终结争议与原付款");
    const reviewRequested = a.page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/admin/billing/approvals" &&
        r.request().method() === "POST"
    );
    await reviewRow.getByRole("button", { name: "核验并提交解限申请" }).click();
    const reviewRequest = await reviewRequested;
    assert.equal(reviewRequest.status(), 200);
    const reviewApproval = BillingApprovalSchema.parse(
      (await reviewRequest.json()).approval
    );
    fixture.disputeReviewApprovalId = reviewApproval.approvalId;
    writeFileSync(file, JSON.stringify(fixture), { mode: 0o600 });
    assert.equal(
      reviewApproval.disputeReviewSnapshot?.checkoutId,
      fixture.disputeReviewCheckout
    );
    assert.equal(reviewApproval.disputeReviewSnapshot?.spendablePoints, "6");
    assert.equal(
      reviewApproval.disputeReviewSnapshot?.disputeTargetPoints,
      "4"
    );
    await b.page.goto(`${base}/admin/billing`);
    const reviewCard = b.page.locator(
      `[data-approval-record-id="${reviewApproval.approvalId}"]`
    );
    await expect(reviewCard).toContainText("解限后可新用：6");
    await b.page.screenshot({
      fullPage: true,
      path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/dispute-review-approval-390.png`,
    });
    const reviewApprovalPath = `${base}/api/admin/billing/approvals/${reviewApproval.approvalId}/approve`;
    await json(
      await a.context.request.post(reviewApprovalPath, { headers: origin }),
      409
    );
    const reviewApproved = b.page.waitForResponse(
      (r) => r.url() === reviewApprovalPath && r.request().method() === "POST"
    );
    await reviewCard.getByRole("button", { name: "允许处理" }).click();
    assert.equal((await reviewApproved).status(), 200);
    const reviewExecutionPath = `${base}/api/admin/billing/dispute-reviews/execute`;
    const reviewExecution = {
      data: { approvalId: reviewApproval.approvalId },
      headers: origin,
    };
    await json(
      await a.context.request.post(reviewExecutionPath, reviewExecution),
      403
    );
    await json(
      await operator.context.request.post(reviewExecutionPath, reviewExecution),
      403
    );
    const reviewExecuted = b.page.waitForResponse(
      (r) => r.url() === reviewExecutionPath
    );
    await reviewCard.getByRole("button", { name: "确认并处理" }).click();
    const reviewResult = await reviewExecuted;
    assert.equal(reviewResult.status(), 200);
    assert.equal(
      BillingApprovalExecutionResponseSchema.parse(await reviewResult.json())
        .duplicate,
      false
    );
    assert.equal(
      BillingApprovalExecutionResponseSchema.parse(
        await json(
          await b.context.request.post(reviewExecutionPath, reviewExecution)
        )
      ).duplicate,
      true
    );
    await expect(reviewCard).toHaveCount(0);
    const afterReview = CheckoutStatusSchema.parse(
      await json(await b.context.request.get(reviewStatusPath))
    );
    assert.equal(afterReview.paymentPosition?.restrictedPoints, "0");
    assert.equal(afterReview.paymentPosition?.spendablePoints, "6");
    assert.equal(afterReview.paymentPosition?.disputedPoints, "4");
    await b.page.goto(
      `${base}/account/billing/return?checkoutId=${reviewCheckout}`
    );
    const reviewedOrder = b.page.getByRole("main");
    await expect(
      reviewedOrder.getByTestId("checkout-spendablePoints")
    ).toHaveText("6");
    await expect(
      reviewedOrder.getByTestId("checkout-disputedPoints")
    ).toHaveText("4");
    await b.page.screenshot({
      fullPage: true,
      path: `${process.env.CONNECTED_ACCEPTANCE_ARTIFACTS}/dispute-review-return-390.png`,
    });
    assert.deepEqual(pageErrors, []);
    assert.equal(chatSubmissions, 0, "billing recovery must not submit chat");
    console.log(
      JSON.stringify({
        blockedExternalBrowserRequests,
        chatSubmissions,
        lifecycle: "reserve/dispatch/report-unknown/UI-double-approval/release",
        loggedInPersonas: 4,
        modelAcceptance: false,
        observations,
        organizationBalance: "7",
        paymentCaseWorkerLog: "attention-reasons-only",
        personalBalance: "30",
        providerAcceptance: false,
        publicDisputeReview:
          "UI-request/second-approve/execute/duplicate/order-spendable-6/loss-4",
        publicRefundRecovery:
          "UI-request/second-approve/execute/duplicate/source-preserved",
        refundAttentionReturn: ["pending", "review_required"],
        scope: "owned-chatnest-payload-connected",
        screenshotCount: 30,
        unknownSnapshotReturn: "refunded/plan-null/no-backfill",
        viewports: [1440, 390],
        walletAdjustment:
          "UI-request/approve/reloaded-execute/lost-response-duplicate-once",
        walletUIAdjustmentCount: 1 + organizationAdjustmentKeys.length,
      })
    );
  } finally {
    await browser.close();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
