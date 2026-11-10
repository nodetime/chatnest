import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { compare } from "bcrypt-ts";
import { parse } from "dotenv";
import postgres from "postgres";
import { getSeedAccount } from "@/server/shared/login-identity";
import { generateHashedPassword } from "@/server/shared/password";

export function resolveSeedDatabaseUrl(
  env: Record<string, string | undefined>
): string {
  const configuredUrl = env.POSTGRES_URL;
  if (!configuredUrl || !URL.canParse(configuredUrl)) {
    throw new Error("INVALID_SEED_DATABASE_URL");
  }
  const parsed = new URL(configuredUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname
  ) {
    throw new Error("INVALID_SEED_DATABASE_URL");
  }
  return configuredUrl;
}

function registerAdminAccount(accountId: string): void {
  const filename = ".env.local";
  let text = existsSync(filename) ? readFileSync(filename, "utf8") : "";
  const ids = new Set(
    [
      process.env.PLATFORM_ADMIN_USER_IDS ?? "",
      parse(text).PLATFORM_ADMIN_USER_IDS ?? "",
      accountId,
    ]
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const declaration = `PLATFORM_ADMIN_USER_IDS=${[...ids].join(",")}`;
  text = /^PLATFORM_ADMIN_USER_IDS=.*$/m.test(text)
    ? text.replace(/^PLATFORM_ADMIN_USER_IDS=.*$/m, declaration)
    : `${text.trimEnd()}\n${declaration}\n`;
  writeFileSync(filename, text, { mode: 0o600 });
  chmodSync(filename, 0o600);
  process.env.PLATFORM_ADMIN_USER_IDS = [...ids].join(",");
}

// 仅由显式种子脚本调用；模块加载与应用请求都不触发数据库连接。
export async function seedInitialAdmin() {
  const databaseUrl = resolveSeedDatabaseUrl(process.env);
  const accountConfig = getSeedAccount();
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const accountId = await sql.begin(async (tx) => {
      // users.email 没有唯一约束；沿用原锁键，避免兼容入口并发初始化时重复创建。
      await tx`SELECT pg_advisory_xact_lock(hashtext('chatnest-development-admin'))`;
      const rows = await tx<{ id: string; password: string | null }[]>`
        SELECT id, password FROM users WHERE email = ${accountConfig.email} FOR UPDATE
      `;
      if (rows.length > 1) {
        throw new Error("DUPLICATE_SEED_ACCOUNT");
      }
      const [account] = rows;
      if (!account) {
        const [created] = await tx<{ id: string }[]>`
          INSERT INTO users (email, password, name, is_anonymous)
          VALUES (${accountConfig.email}, ${generateHashedPassword(accountConfig.password)}, ${accountConfig.username}, false)
          RETURNING id
        `;
        return created.id;
      }
      if (
        !account.password ||
        !(await compare(accountConfig.password, account.password))
      ) {
        await tx`
          UPDATE users SET password = ${generateHashedPassword(accountConfig.password)},
            session_revision = session_revision + 1, updated_at = now()
          WHERE id = ${account.id}
        `;
      }
      return account.id;
    });
    registerAdminAccount(accountId);
    return {
      accountId,
      email: accountConfig.email,
      username: accountConfig.username,
    };
  } finally {
    await sql.end();
  }
}
