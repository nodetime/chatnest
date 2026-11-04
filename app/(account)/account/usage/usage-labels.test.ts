import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  operationStateLabel,
  outcomeLabel,
  purposeLabel,
  sessionLabel,
  subjectLabel,
} from "./usage-labels";

test("usage labels show user-facing billing values", () => {
  assert.equal(subjectLabel("model"), "模型");
  assert.equal(purposeLabel("model", ""), "回答问题");
  assert.equal(
    purposeLabel("tool", "porta/onebound_1688_item_search"),
    "商品搜索"
  );
  assert.equal(operationStateLabel("reconcile_pending"), "正在结算");
  assert.equal(outcomeLabel("success"), "已完成");
});

test("usage labels do not expose a long internal chat identifier", () => {
  assert.equal(
    sessionLabel("550e8400-e29b-41d4-a716-446655440000"),
    "一次会话"
  );
  assert.equal(sessionLabel("研究计划"), "研究计划");
});

test("usage page gives a clear next action when the account has no history", () => {
  const page = readFileSync("app/(account)/account/usage/page.tsx", "utf8");
  assert.match(page, /<h1[^>]*>使用记录<\/h1>/);
  assert.match(page, /选择一次对话，查看模型、工具和每一步扣费/);
  assert.doesNotMatch(page, /暂扣/);
  assert.match(page, /href="\/account\/billing"/);
  assert.match(page, /购买方案/);
  assert.match(page, /开始对话/);
  assert.equal(
    (page.match(/className="rounded-lg border border-border\/70 p-3"/g) ?? [])
      .length,
    1
  );
  assert.match(page, /balance \?\?/);
  assert.doesNotMatch(page, /useState\("—"\)/);
});

test("session status uses completion semantics rather than an operation fallback", async () => {
  const { sessionStatusLabel } = await import("./usage-labels");
  assert.equal(sessionStatusLabel("completed"), "已完成");
  assert.equal(sessionStatusLabel("active"), "进行中");
  assert.equal(sessionStatusLabel("unknown-fixture"), "状态未知");
});
