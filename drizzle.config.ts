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
  out: "./server/db/migrations",
  schema: "./server/db/schema.ts",
});
