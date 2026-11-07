import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("personal billing page does not load organization data when capability is disabled", () => {
  const page = readFileSync("app/(account)/account/billing/page.tsx", "utf8");
  const client = readFileSync(
    "app/(account)/account/billing/billing-page-client.tsx",
    "utf8"
  );

  assert.doesNotMatch(page, /organization|organizationsEnabled/);
  assert.doesNotMatch(
    client,
    /\/api\/organizations|organizationsEnabled|organization-switcher/
  );
  assert.doesNotMatch(client, /组织共享/);
});

test("account overview uses a server projection instead of static-only cards", () => {
  const page = readFileSync("app/(account)/account/page.tsx", "utf8");
  assert.match(page, /loadAccountOverview/);
  assert.match(page, /createUserPlatformClient/);
  assert.match(page, /overview\.billing\.balancePoints/);
  assert.match(page, /overview\.recentUsage/);
  assert.match(page, /overview\.subscription/);
  assert.match(page, /当前方案/);
  assert.match(page, /accountStatusLabel/);
  assert.doesNotMatch(page, />账户正常<\/Badge>/);
  assert.match(page, /还没有用量记录/);
  assert.doesNotMatch(page, /暂无已同步的会话用量/);
  assert.doesNotMatch(page, /balancePoints \?\? "—"/);
});

test("account shell redirects guests before rendering personal billing surfaces", () => {
  const layout = readFileSync("app/(account)/layout.tsx", "utf8");
  assert.match(layout, /session\?\.user\?\.type !== "regular"/);
  assert.match(layout, /redirect\("\/login\?next=%2Faccount"\)/);
});

test("account settings keeps personal controls separate from billing authority", () => {
  const page = readFileSync("app/(account)/account/settings/page.tsx", "utf8");
  const route = readFileSync(
    "app/(chat)/api/account/settings/route.ts",
    "utf8"
  );
  const deletion = readFileSync(
    "app/(chat)/api/account/deletion-request/route.ts",
    "utf8"
  );
  const exportRoute = readFileSync(
    "app/(chat)/api/account/export/route.ts",
    "utf8"
  );
  const sessionsRoute = readFileSync(
    "app/(chat)/api/account/sessions/revoke/route.ts",
    "utf8"
  );
  const auth = readFileSync("app/(auth)/auth.ts", "utf8");

  assert.match(page, /session\?\.user\?\.type !== "regular"/);
  assert.match(route, /session\?\.user\?\.type === "regular"/);
  assert.match(route, /SETTINGS_SCOPE_REQUIRED/);
  assert.match(route, /sameOriginBrowserControl/);
  assert.match(deletion, /confirm.*DELETE/);
  assert.match(deletion, /ORIGIN_MISMATCH/);
  assert.match(exportRoute, /MAX_EXPORT_BYTES/);
  assert.match(sessionsRoute, /revokeSessions/);
  assert.match(sessionsRoute, /sameOriginBrowserControl/);
  assert.match(auth, /sessionRevision/);
  assert.match(auth, /return null/);
  assert.doesNotMatch(route, /walletId|role|organizationId/);
});

test("personal billing explicitly selects personal scope even when an organization cookie exists", () => {
  const client = readFileSync(
    "app/(account)/account/billing/billing-page-client.tsx",
    "utf8"
  );
  assert.match(client, /api\/billing\/plans\?organizationId=/);
  assert.match(client, /api\/billing\/subscriptions\?organizationId=/);
  assert.match(client, /organizationId: null/);
});
