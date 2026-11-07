import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync("app/admin/billing/page.tsx", "utf8");
const labels = readFileSync("app/_lib/billing-labels.ts", "utf8");

test("billing admin page uses human-readable labels for internal billing states", () => {
  assert.match(page, /待处理调用/);
  assert.match(labels, /正在结算/);
  assert.match(labels, /已完成/);
  assert.match(page, /扣除本次积分/);
  assert.match(page, /退回本次预留/);
  assert.doesNotMatch(page, /扣除这次积分/);
  assert.doesNotMatch(page, /退回这次预留/);
  assert.match(page, /确认并处理/);
  assert.match(page, /待处理/);
});

test("billing admin page does not expose raw state JSON in the default audit view", () => {
  assert.doesNotMatch(page, /JSON\.stringify\(audit\.(beforeState|afterState)/);
  assert.match(page, /查看详情/);
});

test("billing admin page keeps raw IDs out of the primary operation columns", () => {
  assert.doesNotMatch(page, /<TableHead>类型<\/TableHead>/);
  assert.doesNotMatch(page, /<TableHead>模型\/工具<\/TableHead>/);
  assert.match(page, /用途/);
});

test("billing admin page provides a bounded audit export with download tracking", () => {
  assert.match(page, /api\/admin\/billing\/audit\/export\?scope=billing/);
  const route = readFileSync(
    "app/api/admin/billing/audit/export/route.ts",
    "utf8"
  );
  assert.match(route, /MAX_EXPORT_ROWS = 1000/);
  assert.match(route, /recordBillingAuditExport/);
  assert.match(route, /Content-Disposition/);
});

test("billing admin page hides money-moving actions from operator viewers", () => {
  assert.match(page, /canMutateBilling/);
  assert.match(page, /等待管理员审批/);
  assert.match(page, /等待管理员执行/);
});

test("billing admin page reuses the shared user-facing billing labels", () => {
  assert.match(page, /@\/app\/_lib\/billing-labels/);
  assert.doesNotMatch(page, /const operationStateLabel/);
  assert.doesNotMatch(page, /function subjectLabel/);
  assert.doesNotMatch(page, /function purposeLabel/);
});

test("billing admin page exposes bounded operation filters", () => {
  assert.match(page, /账务状态筛选/);
  assert.match(page, /账务对象筛选/);
  assert.match(page, /账务开始日期/);
  assert.match(page, /账务结束日期/);
  assert.match(page, /reconcile_pending/);
  assert.match(page, /清除筛选/);
});

test("billing admin page exposes payment inbox and settlement attention metrics", () => {
  assert.match(page, /api\/admin\/billing\/health/);
  assert.match(page, /结算死信/);
  assert.match(page, /支付收件箱/);
  assert.match(page, /余额不足退款/);
  assert.match(page, /结算待处理/);
  assert.match(page, /支付事件待处理/);
  assert.match(page, /provider 原始 payload/);
});

test("billing admin page uses bounded cursor pagination for operation history", () => {
  assert.match(page, /加载更多记录/);
  assert.match(page, /cursor: operationCursor/);
  assert.match(page, /limit: "20"/);
  const route = readFileSync("app/api/admin/billing/overview/route.ts", "utf8");
  assert.match(route, /platformQuerySchema\("billingInternalAdminOverview"\)/);
  assert.match(route, /parsePlatformQuery/);
});

test("billing health route requires the mapped platform admin", () => {
  const route = readFileSync("app/api/admin/billing/health/route.ts", "utf8");
  assert.match(route, /resolvePlatformAdmin/);
  assert.match(route, /settlementHealth/);
  assert.match(route, /ADMIN_REQUIRED/);
});

test("billing admin separates unknown balances from loading and real zero", async () => {
  const { availableBalanceLabel } = await import(
    "../../../app/_lib/billing-labels"
  );
  assert.equal(availableBalanceLabel(undefined), "读取中…");
  assert.equal(availableBalanceLabel(null), "待启用或对账");
  assert.equal(availableBalanceLabel("0"), "0 积分");
  assert.equal(
    availableBalanceLabel("19999999999999999998"),
    "19999999999999999998 积分"
  );
  assert.match(page, /walletAccounting/);
  assert.match(page, /余额未汇总/);
  assert.doesNotMatch(page, /data\?\.balancePoints \?\? "读取中…"/);
});

test("wallet requests without a complete snapshot do not offer an execution action", () => {
  assert.match(page, /case "reconcile":\s*return approval\.decision !== null/);
  assert.match(page, /approval\.deltaPoints !== null/);
  assert.match(
    page,
    /case "dispute_review":\s*return approval\.disputeReviewSnapshot !== null/
  );
  assert.match(page, /审批明细不完整，请重新申请/);
});

test("approval actions respect the current mapped requester and executor identities", () => {
  assert.match(page, /approval\.requestedBy !== data\?\.adminId/);
  assert.match(page, /approval\.approvedBy === data\?\.adminId/);
  assert.match(page, /等待另一位管理员审批/);
  assert.match(page, /等待审批管理员执行/);
});

test("wallet adjustment is requested through the existing page with generated input and no manual revision", () => {
  const form = readFileSync(
    "app/admin/billing/wallet-adjustment-form.tsx",
    "utf8"
  );
  assert.match(page, /canMutateBilling && <WalletAdjustmentForm/);
  assert.match(form, /ApprovalRequestSchema/);
  assert.match(form, /调账用户编号/);
  assert.match(form, /调账组织编号/);
  assert.match(form, /调账积分/);
  assert.match(form, /调账原因/);
  assert.match(form, /提交调账申请/);
  assert.doesNotMatch(form, /revision:|localStorage|sessionStorage/);
});
test("wallet execution uses the persisted approval snapshot and stable per-approval replay key", () => {
  assert.match(page, /type Approval = BillingApproval/);
  assert.match(page, /deltaPoints: approval.deltaPoints/);
  assert.match(page, /organizationId: approval.organizationId/);
  assert.match(page, /reason: approval.reason/);
  assert.match(page, /wallet-adjust:\$\{approval.approvalId\}/);
  assert.match(page, /调整积分：/);
  assert.match(page, /版本：/);
});

test("refund recovery uses original dual approval with explicit customer choice and no caller amount", () => {
  assert.match(page, /approval\.action === "refund_recovery"/);
  assert.match(page, /RefundRecoveryForm/);
  const form = readFileSync(
    "app/admin/billing/refund-recovery-form.tsx",
    "utf8"
  );
  assert.match(form, /ApprovalRequestSchema/);
  assert.match(form, /customer_elected_original_entitlement/);
  assert.match(form, /客户已明确选择恢复原额度/);
  assert.doesNotMatch(form, /amountMinor:|deltaPoints:|wallets\/.*adjust/);
  assert.match(page, /recoverySnapshot/);
  assert.match(page, /到期部分/);
});

test("customer checkout separates applied recovery from bank refund arrival", () => {
  const source = readFileSync(
    "app/(account)/account/billing/return/page.tsx",
    "utf8"
  );
  assert.match(source, /refundRecovery/);
  assert.match(source, /现金退款未成功/);
  assert.match(source, /恢复时已过期/);
});

test("native dispute fact audit is explicitly not a completed money adjustment", () => {
  assert.match(
    page,
    /"billing\.dispute\.facts_recorded": "记录争议事实（资金待核）"/
  );
});
