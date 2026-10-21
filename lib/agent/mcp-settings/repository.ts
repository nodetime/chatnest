import "server-only";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { mcpSettings } from "../../db/schema";
export type SettingsRow = {
  revision: number;
  encrypted: string;
  updatedBy: string;
  updatedAt: Date;
};
export interface SettingsRepository {
  compareAndSwap: (expected: number, next: SettingsRow) => Promise<boolean>;
  read: () => Promise<SettingsRow | null>;
}
let database: ReturnType<typeof drizzle> | undefined;
function db() {
  if (!database) {
    if (!process.env.POSTGRES_URL) {
      throw new Error("MCP database is not configured");
    }
    database = drizzle(postgres(process.env.POSTGRES_URL, { max: 2 }));
  }
  return database;
}
export const settingsRepository: SettingsRepository = {
  async compareAndSwap(expected, next) {
    if (expected === 0) {
      const rows = await db()
        .insert(mcpSettings)
        .values({ id: "workspace", ...next })
        .onConflictDoNothing()
        .returning({ revision: mcpSettings.revision });
      return rows.length === 1;
    }
    const rows = await db()
      .update(mcpSettings)
      .set(next)
      .where(
        and(eq(mcpSettings.id, "workspace"), eq(mcpSettings.revision, expected))
      )
      .returning({ revision: mcpSettings.revision });
    return rows.length === 1;
  },
  async read() {
    const [row] = await db()
      .select()
      .from(mcpSettings)
      .where(eq(mcpSettings.id, "workspace"));
    return row ?? null;
  },
};
