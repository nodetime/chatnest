import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env.local",
});

export default defineConfig({
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? "",
  },
  dialect: "postgresql",
  out: "./server/infrastructure/persistence/drizzle/migrations",
  schema: "./server/infrastructure/persistence/drizzle/schema.ts",
});
