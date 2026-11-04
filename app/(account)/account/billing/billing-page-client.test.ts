import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  "app/(account)/account/billing/billing-page-client.tsx",
  "utf8"
);

test("personal billing page does not expose organization switching", () => {
  assert.doesNotMatch(source, /选择付款账户/);
  assert.doesNotMatch(source, /个人或组织/);
  assert.doesNotMatch(
    source,
    /OrganizationSwitcher|组织账户|\/api\/organizations/
  );
  assert.match(source, /\/api\/billing\/plans\?organizationId=/);
  assert.match(source, /\/api\/billing\/subscriptions\?organizationId=/);
  assert.match(source, /organizationId: null/);
});

test("billing copy explains what the user buys", () => {
  assert.match(source, /方案与余额/);
  assert.match(source, /选择方案/);
  assert.match(source, /每月获得/);
  assert.match(source, /按月方案，自动续费/);
  assert.match(source, /购买方案/);
  assert.doesNotMatch(source, /开通方案/);
  assert.match(source, /每次会话都可查看扣费明细/);
  assert.doesNotMatch(source, /个人会话级明细/);
  assert.doesNotMatch(source, /balancePoints \?\? "—"/);
  assert.doesNotMatch(source, /支付服务|webhook|providerLabel/);
});

test("billing price is rendered as one readable phrase", () => {
  assert.match(source, /formatPlanPrice\(plan\)/);
  assert.doesNotMatch(
    source,
    /<span className="text-3xl[^>]*>[\s\S]*<\/span>[\s\S]*currencyLabel\(plan\.currency\)/
  );
});

test("wallet card names and uses the three server-provided amounts", () => {
  assert.match(source, /data\?\.spendablePoints/);
  assert.match(source, /可新用积分/);
  assert.match(source, /账面余额/);
  assert.match(source, /data\.balancePoints/);
  assert.match(source, /受限积分/);
  assert.match(source, /data\.restrictedPoints/);
  assert.doesNotMatch(source, /余额可用于模型和工具调用/);
});
