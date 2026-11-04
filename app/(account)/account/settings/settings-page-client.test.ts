import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  "app/(account)/account/settings/settings-page-client.tsx",
  "utf8"
);

test("settings page is organized by human tasks", () => {
  for (const heading of [
    "个人资料",
    "回答设置",
    "通知",
    "登录与安全",
    "数据与隐私",
    "危险操作",
  ]) {
    assert.match(source, new RegExp(heading));
  }
  assert.match(source, /确认提交删除申请/);
  assert.match(source, /删除申请不会立即删除/);
});
