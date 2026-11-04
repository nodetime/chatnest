import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  "app/_components/account/account-shell.tsx",
  "utf8"
);

test("personal account shell has one clear context and no duplicated page intro", () => {
  assert.match(source, /个人账户/);
  assert.match(source, /返回对话/);
  for (const label of ["总览", "方案与余额", "使用记录", "设置"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  assert.match(source, /账户导航/);
  assert.match(source, /className="hidden h-fit lg:block lg:sticky lg:top-6"/);
  assert.doesNotMatch(source, /组织与成员/);
  assert.doesNotMatch(source, /组织切换/);
  assert.doesNotMatch(source, /<h1[^>]*>\s*账户中心/);
  assert.doesNotMatch(source, /管理个人账户、订阅和积分用量/);
});

test("platform administration stays a separate explicit entry", () => {
  assert.match(source, /进入平台管理/);
  assert.match(source, /href="\/admin"/);
});

test("account overview cards use the same concise labels as navigation", () => {
  const overview = readFileSync("app/(account)/account/page.tsx", "utf8");
  assert.match(overview, /title: "方案与余额"/);
  assert.match(overview, /title: "使用记录"/);
  assert.match(overview, /查看方案/);
  assert.match(overview, /查看记录/);
  assert.doesNotMatch(overview, />打开<\/Link>/);
  assert.doesNotMatch(overview, /组织与成员|组织切换/);
});

test("account layout fallback does not render dynamic children twice", () => {
  const layout = readFileSync("app/(account)/layout.tsx", "utf8");
  assert.match(layout, /fallback=\{/);
  assert.match(layout, /正在加载账户/);
  assert.doesNotMatch(
    layout,
    /fallback=\{<AccountShell>\{children\}<\/AccountShell>\}/
  );
});
