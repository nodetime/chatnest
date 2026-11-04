import { platformRoute } from "../../server/application/platform/generated/routes";
import { platformResponseSchema } from "../../server/application/platform/generated/wire";

type OperationId = Parameters<typeof platformRoute>[0];
async function main() {
  const base = new URL(process.env.PLATFORM_BASE_URL ?? "http://127.0.0.1:9");
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.protocol !== "http:" ||
    base.username ||
    base.password
  ) {
    throw new Error("LOCAL_HTTP_REQUIRED");
  }
  const token = process.env.PLATFORM_SERVICE_TOKEN;
  const subject = process.env.PLATFORM_ADMIN_SUBJECT;
  const issuer = process.env.PLATFORM_ADMIN_ISSUER ?? "chatnest";
  if (!token || !subject) {
    throw new Error("LOCAL_FIXTURE_CREDENTIALS_REQUIRED");
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Platform-Admin-Issuer": issuer,
    "X-Platform-Admin-Subject": subject,
    "X-Platform-Internal": "1",
  };
  const cases: {
    id: OperationId;
    query?: string;
    expected: number;
    anonymous?: boolean;
  }[] = [
    { expected: 200, id: "billingInternalAdminCapability" },
    { expected: 200, id: "billingInternalAdminOverview", query: "?limit=1" },
    {
      expected: 200,
      id: "billingListBillingAudit",
      query: "?scope=billing&limit=2",
    },
    {
      expected: 200,
      id: "billingListBillingApprovals",
      query: "?status=pending&limit=2",
    },
    {
      expected: 200,
      id: "billingListBillingApprovals",
      query: "?status=approved&limit=2",
    },
    { expected: 400, id: "billingInternalAdminOverview", query: "?limit=101" },
    { anonymous: true, expected: 401, id: "billingInternalAdminCapability" },
    { expected: 403, id: "billingAdminOverview" },
  ];
  const observations: {
    id: OperationId;
    status: number;
    validated: boolean;
  }[] = [];
  for (const scenario of cases) {
    const route = platformRoute(scenario.id);
    // biome-ignore lint/performance/noAwaitInLoops: record each bounded HTTP observation in scenario order.
    const response = await fetch(
      new URL(`/api${route.path}${scenario.query ?? ""}`, base),
      {
        headers: scenario.anonymous ? {} : headers,
        method: route.method.toUpperCase(),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      }
    );
    const value: unknown = await response.json();
    const result = platformResponseSchema(
      scenario.id,
      response.status
    ).safeParse(value);
    if (response.status !== scenario.expected || !result.success) {
      console.error(
        JSON.stringify({
          code: "CONTRACT_HTTP_MISMATCH",
          id: scenario.id,
          issues: result.success
            ? []
            : result.error.issues.map((issue) => ({
                code: issue.code,
                path: issue.path,
              })),
          status: response.status,
        })
      );
      throw new Error("CONTRACT_HTTP_MISMATCH");
    }
    observations.push({
      id: scenario.id,
      status: response.status,
      validated: true,
    });
  }
  console.log(
    JSON.stringify({ observations, scope: "local-connected-read-only" })
  );
}
main().catch(() => {
  console.error(JSON.stringify({ code: "CONTRACT_HTTP_ACCEPTANCE_FAILED" }));
  process.exitCode = 1;
});
