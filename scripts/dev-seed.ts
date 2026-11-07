import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { compare } from "bcrypt-ts";
import { config } from "dotenv";
import postgres from "postgres";
import { getDevelopmentAccount } from "../server/shared/login-identity";
import { generateHashedPassword } from "../server/shared/password";

config({ path: ".env.local", quiet: true });

async function main() {
  const localUrl = "postgres://chatnest:chatnest@127.0.0.1:55432/chatnest";
  const accountConfig = getDevelopmentAccount();
  if (!accountConfig || process.env.POSTGRES_URL !== localUrl) {
    throw new Error("LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
  }
  const sql = postgres(localUrl, { max: 1 });
  try {
    const accountId = await sql.begin(async (tx) => {
      // users.email 没有唯一约束；串行化开发初始化，防止并发启动重复创建。
      await tx`SELECT pg_advisory_xact_lock(hashtext('chatnest-development-admin'))`;
      const rows = await tx<{ id: string; password: string | null }[]>`
        SELECT id, password FROM users WHERE email = ${accountConfig.email} FOR UPDATE
      `;
      if (rows.length > 1) {
        throw new Error("DUPLICATE_DEVELOPMENT_ACCOUNT");
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
    const filename = ".env.local";
    let text = existsSync(filename) ? readFileSync(filename, "utf8") : "";
    const ids = new Set(
      (process.env.PLATFORM_ADMIN_USER_IDS ?? "").split(",").filter(Boolean)
    );
    ids.add(accountId);
    const declaration = `PLATFORM_ADMIN_USER_IDS=${[...ids].join(",")}`;
    text = /^PLATFORM_ADMIN_USER_IDS=.*$/m.test(text)
      ? text.replace(/^PLATFORM_ADMIN_USER_IDS=.*$/m, declaration)
      : `${text.trimEnd()}\n${declaration}\n`;
    writeFileSync(filename, text, { mode: 0o600 });
    chmodSync(filename, 0o600);
    console.log(`开发账号 ${accountConfig.username} 已就绪（仅本地开发库）`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "DEVELOPMENT_SEED_FAILED"
  );
  process.exitCode = 1;
});
