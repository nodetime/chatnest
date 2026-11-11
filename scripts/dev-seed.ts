import { config } from "dotenv";
import { seedInitialAdmin } from "../server/infrastructure/persistence/drizzle/seed";

config({ path: ".env.local", quiet: true });

seedInitialAdmin()
  .then(({ username, email, accountId }) => {
    console.log(`初始管理员 ${username}（${email}，${accountId}）已就绪`);
    console.log(
      "PLATFORM_ADMIN_USER_IDS 已登记到 .env.local；运行中的应用需重新加载配置。"
    );
  })
  .catch((error: unknown) => {
    // 数据库错误可能携带连接信息或 SQL 参数，只报告可识别的错误代号。
    const message = error instanceof Error ? error.message : "";
    const code = /^[A-Z][A-Z0-9_]{1,63}$/.test(message)
      ? message
      : "ADMIN_SEED_FAILED";
    console.error(
      `初始管理员种子执行失败（${code}），请检查连接、账号配置与数据库迁移。`
    );
    process.exitCode = 1;
  });
