import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import {
  createPlatformBillingClient,
  platformResponseError,
} from "@/server/application/platform/client";
import { platformQuerySchema } from "@/server/application/platform/generated/wire";
import type { PlatformAuditLog } from "@/server/application/platform/protocol";
import { parsePlatformQuery } from "@/server/application/platform/request-validation";
import { getEnv } from "@/server/shared/env";

const MAX_EXPORT_ROWS = 1000;

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export async function GET(request: Request) {
  const session = await auth();
  if (!(await resolvePlatformAdmin(session?.user, process.env, "admin"))) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  const env = getEnv();
  const adminSubject = session?.user?.id;
  if (!adminSubject) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  if (
    env.PLATFORM_MODE !== "connected" ||
    !env.PLATFORM_BASE_URL ||
    !env.PLATFORM_SERVICE_TOKEN
  ) {
    return Response.json({ code: "PLATFORM_NOT_CONNECTED" }, { status: 503 });
  }
  const params = new URL(request.url).searchParams;
  const client = createPlatformBillingClient({
    adminIdentity: {
      issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
      subject: adminSubject,
    },
    baseUrl: env.PLATFORM_BASE_URL,
    serviceToken: env.PLATFORM_SERVICE_TOKEN,
  });
  try {
    const filters = parsePlatformQuery(
      platformQuerySchema("billingListBillingAudit").omit({
        cursor: true,
        limit: true,
      }),
      params
    );
    const listAudit = client.listBillingAudit;
    if (!listAudit) {
      return Response.json({ code: "AUDIT_NOT_CONFIGURED" }, { status: 503 });
    }
    const recordExport = client.recordBillingAuditExport;
    if (!recordExport) {
      return Response.json(
        { code: "AUDIT_EXPORT_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    const collect = async (
      cursor: string | undefined,
      rows: PlatformAuditLog[]
    ): Promise<PlatformAuditLog[] | null> => {
      const page = await listAudit({
        ...filters,
        cursor,
        limit: Math.min(100, MAX_EXPORT_ROWS - rows.length),
      });
      if (!page) {
        return null;
      }
      const remaining = MAX_EXPORT_ROWS - rows.length;
      const nextAudits = [...rows, ...page.audits.slice(0, remaining)];
      const nextCursor = page.nextCursor ?? undefined;
      if (!nextCursor || nextAudits.length >= MAX_EXPORT_ROWS) {
        return nextAudits;
      }
      return collect(nextCursor, nextAudits);
    };
    const audits = await collect(undefined, []);
    if (!audits) {
      return Response.json({ code: "AUDIT_NOT_CONFIGURED" }, { status: 503 });
    }

    await recordExport({
      count: audits.length,
      scope: filters.scope,
    });

    const lines = [
      csvRow(["时间", "动作", "资源类型", "结果", "操作者"]),
      ...audits.map((audit) =>
        csvRow([
          audit.createdAt,
          audit.action,
          audit.resourceType,
          audit.result,
          audit.actorId ?? "",
        ])
      ),
    ];
    return new Response(`${lines.join("\n")}\n`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="billing-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return platformResponseError(error, "AUDIT_EXPORT_FAILED");
  }
}
