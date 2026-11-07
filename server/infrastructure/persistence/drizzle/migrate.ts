import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getEnv } from "../../../shared/env";

config({
  path: ".env.local",
});

const runMigrate = async () => {
  const { MIGRATION_POSTGRES_URL } = getEnv();
  if (!MIGRATION_POSTGRES_URL) {
    throw new Error("MIGRATION_POSTGRES_URL_REQUIRED");
  }

  const connection = postgres(MIGRATION_POSTGRES_URL, { max: 1 });
  const db = drizzle(connection);

  console.log("Running migrations...");

  const start = Date.now();
  await migrate(db, {
    migrationsFolder: "./server/infrastructure/persistence/drizzle/migrations",
  });
  const end = Date.now();

  console.log("Migrations completed in", end - start, "ms");
  process.exit(0);
};

runMigrate().catch(() => {
  console.error("MIGRATION_FAILED_CHECK_MIGRATION_POSTGRES_URL_AND_SCHEMA");
  process.exit(1);
});
