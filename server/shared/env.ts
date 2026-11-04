import { z } from "zod";

// P1 地基:server/ 全部 process.env 读取点的集中登记与校验
// 清单与决策记录:docs/01_架构决策/20261025101500_DDD分层待办P1-P4.md
// 设计取舍:全部字段可选 + 每次调用重新解析(不缓存)——
// 保持与散落读取完全等价的行为:模块加载时不因缺变量崩溃,测试里改 env 立即可见。
// app/ 的 NEXT_PUBLIC_* 为构建期内联,不经此处;proxy.ts 属平台层同样不在此列。

const envSchema = z.object({
  ACCOUNT_DELETION_NOTIFICATION_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
  ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_TOKEN: z.string().optional(),
  ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_URL: z.string().url().optional(),
  ACCOUNT_DELETION_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .optional(),
  ACCOUNT_ORGANIZATIONS_ENABLED: z.string().optional(),
  ACCOUNT_RETENTION_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
  AGENT_CONFIG_PATH: z.string().optional(),
  BROWSER_EXECUTABLE_PATH: z.string().optional(),
  BROWSER_RUNTIME: z.string().optional(),
  CHATNEST_CONTROL_TOKEN: z.string().optional(),
  CHATNEST_SETTLEMENT_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .optional(),
  CHATNEST_SETTLEMENT_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .optional(),
  CHATNEST_SETTLEMENT_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
  CHATNEST_WORKER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .optional(),
  IS_DEMO: z.string().optional(),
  LOG_FILE_DIR: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  MIGRATION_POSTGRES_URL: z.string().optional(),
  NEXT_PUBLIC_BASE_PATH: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PAYMENT_CHECKOUT_BASE_URL: z.string().url().optional(),
  PAYMENT_RECONCILE_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
  PLATFORM_BASE_URL: z.string().url().optional(),
  PLATFORM_ID: z.string().min(1).max(128).optional(),
  PLATFORM_MODE: z.enum(["standalone", "connected"]).optional(),
  PLATFORM_SERVICE_TOKEN: z.string().optional(),
  PLATFORM_SESSION_ENCRYPTION_KEY: z.string().optional(),
  PLATFORM_USER_ISSUER: z.string().min(1).max(256).optional(),
  POINT_SCALE: z.coerce
    .number()
    .int()
    .refine((value) => value === 1_000_000, {
      message: "必须固定为 1000000",
    })
    .default(1_000_000),
  POSTGRES_PASSWORD: z.string().optional(),
  // 运行连接串;dev/test保持惰性连接,production在取pool前拒绝空值。迁移仅用MIGRATION_POSTGRES_URL。
  POSTGRES_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`环境变量校验失败 -> ${issues}`);
  }
  return parsed.data;
}

/**
 * Organizations stay behind an explicit rollout switch. Personal billing is
 * the default account model until the multi-tenant UI is ready to expose.
 */
export function organizationsEnabled(
  env: Pick<Env, "ACCOUNT_ORGANIZATIONS_ENABLED"> = getEnv()
) {
  return env.ACCOUNT_ORGANIZATIONS_ENABLED === "1";
}
