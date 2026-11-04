import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("organization account route is gated on the server before the client page loads", () => {
  const path = "app/(account)/account/organizations/layout.tsx";
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, "utf8");
  assert.match(source, /organizationsEnabled\(getEnv\(\)\)/);
  assert.match(source, /redirect\("\/account"\)/);
  const clientPage = readFileSync(
    "app/(account)/account/organizations/page.tsx",
    "utf8"
  );
  assert.doesNotMatch(clientPage, /featureEnabled/);
  assert.doesNotMatch(clientPage, /useRouter/);
});

test("organization API uses a disabled capability error instead of an empty success", () => {
  const source = readFileSync("app/(chat)/api/organizations/route.ts", "utf8");
  assert.match(source, /code: "FEATURE_DISABLED"/);
  assert.match(source, /status: 403/);
  const members = readFileSync(
    "app/(chat)/api/organizations/[organizationId]/members/route.ts",
    "utf8"
  );
  assert.doesNotMatch(members, /ORGANIZATIONS_DISABLED/);
  assert.match(members, /code: "FEATURE_DISABLED"/);
});

test("legacy account aliases redirect to canonical account routes", () => {
  const redirects = {
    "app/(account)/billing/page.tsx": "/account/billing",
    "app/(account)/organizations/page.tsx": "/account/organizations",
    "app/(account)/usage/page.tsx": "/account/usage",
  };
  for (const [path, destination] of Object.entries(redirects)) {
    const source = readFileSync(path, "utf8");
    assert.match(source, new RegExp(`redirect\\("${destination}"\\)`));
  }
});
