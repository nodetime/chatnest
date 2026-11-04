import { readFileSync } from "node:fs";
import { normalizePaymentRecovery } from "./payment-recovery-result.mjs";

const contract = JSON.parse(
  readFileSync(
    new URL("../docs/contracts/platform-points/manifest.json", import.meta.url),
    "utf8"
  )
);
const chatnestBaseUrl = process.env.CHATNEST_BASE_URL;
const controlToken = process.env.CHATNEST_CONTROL_TOKEN;
const platformBaseUrl = process.env.PLATFORM_BASE_URL;
const serviceToken = process.env.PLATFORM_SERVICE_TOKEN;
const adminIssuer = process.env.PLATFORM_ADMIN_ISSUER;
const adminSubject = process.env.PLATFORM_ADMIN_SUBJECT;
if (
  !chatnestBaseUrl ||
  !controlToken ||
  !platformBaseUrl ||
  !serviceToken ||
  !adminIssuer ||
  !adminSubject
) {
  console.error(
    "CHATNEST_BASE_URL, CHATNEST_CONTROL_TOKEN, PLATFORM_BASE_URL, PLATFORM_SERVICE_TOKEN, PLATFORM_ADMIN_ISSUER and PLATFORM_ADMIN_SUBJECT are required"
  );
  process.exit(2);
}

async function check(label, url, init = {}) {
  const response = await fetch(
    new URL(url, label === "chatnest" ? chatnestBaseUrl : platformBaseUrl),
    init
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${label} ${url}: ${response.status} ${body.code || "REQUEST_FAILED"}`
    );
  }
  return body;
}

const headers = {
  Authorization: `Bearer ${serviceToken}`,
  "Content-Type": "application/json",
  "X-Platform-Admin-Issuer": adminIssuer,
  "X-Platform-Admin-Subject": adminSubject,
  "X-Platform-API-Version": contract.apiVersion,
  "X-Platform-Internal": "1",
  "X-Platform-Schema-Revision": contract.schemaRevision,
};
const health = await check("chatnest", "/api/internal/billing/health", {
  headers: { "x-chatnest-control-token": controlToken },
});
const overview = await check(
  "platform",
  "/api/platform/v1/internal/admin/billing/overview",
  { headers }
);
const filteredOverview = await check(
  "platform",
  "/api/platform/v1/internal/admin/billing/overview?from=2026-11-01&state=settled&subjectType=tool&to=2026-11-02",
  { headers }
);
const pagedOverview = await check(
  "platform",
  "/api/platform/v1/internal/admin/billing/overview?limit=1",
  { headers }
);
const pagedNext = pagedOverview.nextCursor
  ? await check(
      "platform",
      `/api/platform/v1/internal/admin/billing/overview?limit=1&cursor=${encodeURIComponent(pagedOverview.nextCursor)}`,
      { headers }
    )
  : null;
if (
  !Array.isArray(pagedOverview.recentOperations) ||
  pagedOverview.recentOperations.length > 1
) {
  throw new Error("OVERVIEW_PAGE_LIMIT_NOT_ENFORCED");
}
if (
  pagedNext &&
  pagedNext.recentOperations?.[0]?.operationId ===
    pagedOverview.recentOperations?.[0]?.operationId
) {
  throw new Error("OVERVIEW_CURSOR_DUPLICATE");
}
if (overview.adminRole && overview.adminRole !== "admin") {
  throw new Error("ADMIN_ROLE_NOT_ADMIN");
}
const worker = await check("chatnest", "/api/internal/billing/outbox", {
  headers: { "x-chatnest-control-token": controlToken },
  method: "POST",
});
const deletion = await check(
  "chatnest",
  "/api/internal/account/deletion-worker",
  {
    headers: { "x-chatnest-control-token": controlToken },
    method: "POST",
  }
);
const notifications = await check(
  "chatnest",
  "/api/internal/account/notification-worker",
  {
    headers: { "x-chatnest-control-token": controlToken },
    method: "POST",
  }
);
const retention = await check(
  "chatnest",
  "/api/internal/account/retention-worker",
  {
    headers: { "x-chatnest-control-token": controlToken },
    method: "POST",
  }
);
const paymentRecovery = normalizePaymentRecovery(
  await check("platform", "/api/platform/v1/internal/payments/reconcile", {
    body: JSON.stringify({ limit: 25 }),
    headers,
    method: "POST",
  })
);
const audit = await check(
  "platform",
  "/api/platform/v1/internal/admin/billing/audit?scope=billing&limit=1",
  { headers }
);
const auditExport = await check(
  "platform",
  "/api/platform/v1/internal/admin/billing/audit/export",
  {
    body: JSON.stringify({ count: 0, scope: "billing" }),
    headers,
    method: "POST",
  }
);
if (Number(worker.deadLettered || 0) > 0) {
  throw new Error("DEAD_LETTER_PRESENT");
}
console.log(
  JSON.stringify({
    audit: {
      count: Array.isArray(audit.audits) ? audit.audits.length : 0,
      exportRecorded: auditExport.recorded === true,
    },
    deletion,
    filteredOverview: {
      operationCount: filteredOverview.operationCount,
      reconcilePending: filteredOverview.reconcilePending,
      state: "settled",
      subjectType: "tool",
    },
    health,
    notifications,
    overview: {
      adminRole: overview.adminRole || "legacy",
      operationCount: overview.operationCount,
      reconcilePending: overview.reconcilePending,
    },
    overviewPagination: {
      firstPageCount: pagedOverview.recentOperations.length,
      hasNext: Boolean(pagedOverview.nextCursor),
      secondPageCount: pagedNext?.recentOperations?.length ?? 0,
    },
    paymentRecovery: {
      caseRisk: paymentRecovery.caseRisk,
      failed: paymentRecovery.failed,
      reconciled: paymentRecovery.reconciled,
    },
    retention,
    worker,
  })
);
