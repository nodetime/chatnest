import {
  type AlertEventInput,
  alertEventSchema,
  parseAlertHistoryCursor,
} from "@/server/shared/alert-history";
import { getDatabaseClient } from "./connection";
export const alertHistoryRepository = {
  async list(historyCursor?: string) {
    const cursor = historyCursor
      ? parseAlertHistoryCursor(historyCursor)
      : undefined;
    // 先绑定text再由Postgres转时间，避免postgres.js按Date序列化丢失游标微秒。
    const rows =
      await getDatabaseClient()`SELECT id,kind,reasons,outcome,http_status,created_at,updated_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at FROM alert_delivery_events WHERE created_at >= NOW() - INTERVAL '30 days' AND (${cursor?.createdAt ?? null}::text::timestamptz IS NULL OR (created_at,id) < (${cursor?.createdAt ?? null}::text::timestamptz,${cursor?.id ?? null}::uuid)) ORDER BY created_at DESC,id DESC LIMIT 31`;
    return {
      items: rows.slice(0, 30).map((row) => ({
        ...alertEventSchema.parse({
          httpStatus: row.http_status,
          id: row.id,
          kind: row.kind,
          outcome: row.outcome,
          reasons: row.reasons,
        }),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
      nextCursor:
        rows.length > 30
          ? `${rows[29].cursor_created_at}|${rows[29].id}`
          : null,
      retentionDays: 30 as const,
    };
  },
  async purge() {
    const rows =
      await getDatabaseClient()`DELETE FROM alert_delivery_events WHERE id IN (SELECT id FROM alert_delivery_events WHERE created_at < NOW() - INTERVAL '30 days' ORDER BY created_at LIMIT 500) RETURNING id`;
    return { batchLimit: 500, deleted: rows.length };
  },
  record(input: AlertEventInput) {
    const value = alertEventSchema.parse(input);
    const sql = getDatabaseClient();
    return sql.begin(async (tx) => {
      await tx`DELETE FROM alert_delivery_events WHERE id IN (SELECT id FROM alert_delivery_events WHERE created_at < NOW() - INTERVAL '30 days' ORDER BY created_at LIMIT 500)`;
      const rows =
        await tx`INSERT INTO alert_delivery_events (id,kind,reasons,outcome,http_status) VALUES (${value.id},${value.kind},${JSON.stringify(value.reasons)}::json,${value.outcome},${value.httpStatus}) ON CONFLICT (id) DO UPDATE SET outcome=EXCLUDED.outcome,http_status=EXCLUDED.http_status,updated_at=CASE WHEN alert_delivery_events.outcome='pending' AND EXCLUDED.outcome<>'pending' THEN NOW() ELSE alert_delivery_events.updated_at END WHERE alert_delivery_events.kind=EXCLUDED.kind AND alert_delivery_events.reasons::jsonb=EXCLUDED.reasons::jsonb AND (alert_delivery_events.outcome='pending' OR (alert_delivery_events.outcome=EXCLUDED.outcome AND alert_delivery_events.http_status IS NOT DISTINCT FROM EXCLUDED.http_status)) RETURNING id`;
      return rows.length === 1;
    });
  },
};
