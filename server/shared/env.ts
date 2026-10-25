import { z } from "zod";

// P1 地基:server/ 全部 process.env 读取点的集中登记与校验
// 清单与决策记录:docs/01_架构决策/20261025101500_DDD分层待办P1-P4.md
// 设计取舍:全部字段可选 + 每次调用重新解析(不缓存)——
// 保持与散落读取完全等价的行为:模块加载时不因缺变量崩溃,测试里改 env 立即可见。
// app/ 的 NEXT_PUBLIC_* 为构建期内联,不经此处;proxy.ts 属平台层同样不在此列。

const envSchema = z.object({
  AGENT_CONFIG_PATH: z.string().optional(),
  BROWSER_EXECUTABLE_PATH: z.string().optional(),
  BROWSER_RUNTIME: z.string().optional(),
  IS_DEMO: z.string().optional(),
  LOG_FILE_DIR: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  NEXT_PUBLIC_BASE_PATH: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  // 数据库连接串;缺省时空串兜底,首次真正查询时才失败(与改造前行为一致)
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
