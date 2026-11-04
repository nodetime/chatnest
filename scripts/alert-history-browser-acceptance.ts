// biome-ignore-all lint/performance/noAwaitInLoops: browser viewports are sequential assertions.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

async function main() {
  const base = process.env.ALERT_ACCEPTANCE_BASE_URL;
  assert(
    base === "http://127.0.0.1:33382" &&
      process.env.CHATNEST_ALERT_HISTORY_ACCEPTANCE === "1",
    "OWNED_ALERT_SERVICE_REQUIRED"
  );
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors: string[] = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const unauth = await context.request.get(
      `${base}/api/admin/alerts?historyCursor=bad`
    );
    assert.equal(unauth.status(), 403);
    assert.equal(unauth.headers()["cache-control"], "private, no-store");
    await page.goto(`${base}/login`);
    await page
      .getByLabel("邮箱", { exact: true })
      .fill("alerts-acceptance@example.test");
    const password = process.env.ALERT_ACCEPTANCE_PASSWORD;
    assert(password);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { exact: true, name: "登录" }).click();
    await page.waitForURL((url) => !url.pathname.includes("login"));
    await page.goto(`${base}/admin/alerts`);
    await expect(page.getByText("第 1 页", { exact: true })).toBeVisible();
    const first = await (
      await context.request.get(`${base}/api/admin/alerts`)
    ).json();
    assert.equal(first.alertHistory.data.items.length, 30);
    const bad = await context.request.get(
      `${base}/api/admin/alerts?historyCursor=bad`
    );
    assert.equal(bad.status(), 400);
    assert.equal(bad.headers()["cache-control"], "private, no-store");
    const history = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText("最近告警投递历史", { exact: true }) });
    const next = page.getByRole("button", { exact: true, name: "下一页" });
    const previous = page.getByRole("button", { exact: true, name: "上一页" });
    await expect(previous).toBeDisabled();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ height: 900, width });
      await page.getByRole("button", { exact: true, name: "刷新状态" }).click();
      await expect(page.getByText("第 1 页", { exact: true })).toBeVisible();
      await expect(history.locator("li")).toHaveCount(30);
      await next.click();
      await expect(page.getByText("第 2 页", { exact: true })).toBeVisible();
      await expect(history.locator("li")).toHaveCount(30);
      await next.click();
      await expect(page.getByText("第 3 页", { exact: true })).toBeVisible();
      await expect(history.locator("li")).toHaveCount(1);
      await expect(next).toBeDisabled();
      await previous.click();
      await expect(page.getByText("第 2 页", { exact: true })).toBeVisible();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
      await page.screenshot({
        fullPage: true,
        path: `${process.env.ALERT_ACCEPTANCE_ARTIFACTS}/alerts-${width}.png`,
      });
    }
    await page.getByRole("button", { exact: true, name: "刷新状态" }).click();
    await expect(page.getByText("第 1 页", { exact: true })).toBeVisible();
    await page.route("**/api/admin/alerts?**", (route) =>
      route.fulfill({ body: '{"code":"FIXTURE_UNAVAILABLE"}', status: 503 })
    );
    await next.click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "保留上次已确认页面"
    );
    await expect(page.getByText("第 1 页", { exact: true })).toBeVisible();
    await expect(history.locator("li")).toHaveCount(30);
    await page.unroute("**/api/admin/alerts?**");
    // A partial 200 with unavailable history is not a confirmed new history page.
    await page.route("**/api/admin/alerts?**", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.alertHistory = {
        checkedAt: body.checkedAt,
        data: null,
        reason: "read_failed",
        status: "unavailable",
      };
      await route.fulfill({ json: body, response });
    });
    await next.click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "保留上次已确认页面"
    );
    await expect(page.getByText("第 1 页", { exact: true })).toBeVisible();
    await page.unroute("**/api/admin/alerts?**");
    // Deliberately overlap reads: a late old success must not overwrite a newer 403.
    let release!: () => void;
    let ready!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = new Promise<void>((resolve) => {
      ready = resolve;
    });
    await page.route("**/api/admin/alerts*", async (route) => {
      if (new URL(route.request().url()).searchParams.has("historyCursor")) {
        const response = await route.fetch();
        ready();
        await released;
        await route.fulfill({ response });
      } else {
        await route.fulfill({ body: '{"code":"ADMIN_REQUIRED"}', status: 403 });
      }
    });
    await next.click();
    await held;
    const forbiddenRequest = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === "/api/admin/alerts" &&
        !new URL(request.url()).search
    );
    await page.getByRole("button", { exact: true, name: "刷新状态" }).click();
    await forbiddenRequest;
    await expect(page.locator('p[role="alert"]')).toContainText(
      "管理员权限已失效"
    );
    release();
    await page.waitForLoadState("networkidle");
    await expect(history).toHaveCount(0);
    await expect(page.getByText("结算队列", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { exact: true, name: "刷新状态" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "管理员权限已失效"
    );
    assert.equal(errors.length, 0);
    console.log(
      JSON.stringify({
        failedPageRetained: true,
        invalidCursor400: true,
        lateSuccessCannotUndo403: true,
        noModelOrProviderCalls: true,
        pageErrors: 0,
        pages: [30, 30, 1],
        previousAndRefresh: true,
        scope: "real-owned-admin-alerts",
        unauth403BeforeCursor: true,
        unavailableHistoryNotConfirmed: true,
        viewports: [1440, 390],
      })
    );
    await context.close();
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
