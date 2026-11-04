import assert from "node:assert/strict";
import { test } from "node:test";
import { accountErrorMessage } from "./account-error";

test("account surfaces translate platform error codes into user actions", () => {
  assert.equal(
    accountErrorMessage("PLATFORM_NOT_CONNECTED", "读取失败"),
    "积分服务暂时不可用，请稍后刷新。"
  );
  assert.equal(
    accountErrorMessage("CHECKOUT_NOT_FOUND", "读取失败"),
    "这笔支付记录暂时不存在，请返回充值页面重新查看。"
  );
  assert.equal(accountErrorMessage("UNKNOWN", "读取失败"), "读取失败");
});
