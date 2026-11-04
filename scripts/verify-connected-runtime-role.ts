// biome-ignore-all lint/performance/noAwaitInLoops: privilege probes run serially in separate rolled-back transactions.
import assert from "node:assert/strict";
import { isOwnedChatnestRuntime } from "./owned-payload-runtime.mjs";

async function main() {
  const owner =
    "postgres://chatnest:chatnest@127.0.0.1:55432/chatnest_platform_connected_acceptance";
  assert(
    process.env.CHATNEST_PLATFORM_CONNECTED_ACCEPTANCE === "1" &&
      process.env.NODE_ENV === "production" &&
      (isOwnedChatnestRuntime(process.env.POSTGRES_URL) ||
        process.env.POSTGRES_URL === owner),
    "OWNED_CONNECTED_ROLE_FIXTURE_REQUIRED"
  );
  const { getDatabaseClient } = await import(
    "../server/infrastructure/persistence/drizzle/connection"
  );
  let code = 2;
  try {
    if (process.argv.includes("--ready-rejected")) {
      const { checkDatabaseReadiness } = await import(
        "../server/infrastructure/persistence/drizzle/runtime-role"
      );
      await assert.rejects(
        checkDatabaseReadiness(),
        /^Error: DATABASE_RUNTIME_ROLE_UNSAFE$/
      );
      console.log(
        JSON.stringify({
          readinessAuditRejected: true,
          scope: "owned-chatnest-runtime-role",
        })
      );
    } else {
      const { register } = await import("../instrumentation");
      await register();
      const { checkDatabaseReadiness } = await import(
        "../server/infrastructure/persistence/drizzle/runtime-role"
      );
      await checkDatabaseReadiness();
      const identity = new URL(process.env.POSTGRES_URL as string).username;
      for (const role of ["orm", "uploads"] as const) {
        const sql = getDatabaseClient(role);
        const [row] =
          await sql`SELECT current_user AS name, current_user=session_user AS same`;
        assert.equal(row.name, identity);
        assert.equal(row.same, true);
        for (const statement of [
          "CREATE SCHEMA owned_denied_probe",
          "CREATE TEMP TABLE owned_denied_probe(id int)",
          "ALTER TABLE public.users DISABLE TRIGGER ALL",
          "UPDATE drizzle.__drizzle_migrations SET hash=hash",
          "SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq',1,true)",
        ]) {
          await assert.rejects(
            sql.begin((tx) => tx.unsafe(statement)),
            (error: unknown) =>
              Boolean(
                error &&
                  typeof error === "object" &&
                  "code" in error &&
                  error.code === "42501"
              )
          );
        }
      }
      if (process.argv.includes("--live-sessions")) {
        const sql = getDatabaseClient();
        const sessions =
          await sql`SELECT usename, application_name FROM pg_catalog.pg_stat_activity WHERE datname=pg_catalog.current_database() AND backend_type='client backend'`;
        console.log(
          JSON.stringify({
            observedServicePools: (["orm", "uploads"] as const).map((role) => ({
              present: sessions.some(
                (row) =>
                  row.application_name.startsWith(`chatnest-${role}-`) &&
                  row.application_name !== `chatnest-${role}-${process.pid}`
              ),
              role,
            })),
            scope: "owned-chatnest-runtime-role",
          })
        );
        assert(sessions.every((row) => row.usename === identity));
        for (const role of ["orm", "uploads"] as const) {
          assert(
            sessions.some(
              (row) =>
                row.application_name.startsWith(`chatnest-${role}-`) &&
                row.application_name !== `chatnest-${role}-${process.pid}`
            )
          );
        }
        const [users] =
          await sql`SELECT count(*)::integer AS count FROM public.users`;
        assert.equal(users.count, 4);
        console.log(
          JSON.stringify({
            fixtureUsers: 4,
            nonownerOnly: true,
            scope: "owned-chatnest-runtime-role",
            servicePools: ["orm", "uploads"],
          })
        );
      }
      console.log(
        JSON.stringify({
          forbiddenStatementsPerPool: 5,
          pools: ["orm", "uploads"],
          productionInitAccepted: true,
          readyAuditAccepted: true,
          scope: "owned-chatnest-runtime-role",
        })
      );
    }
    code = 0;
  } catch (error) {
    console.error(error); // Private owned-fixture log only; never an application response.
    const rejected =
      error instanceof Error &&
      error.message === "DATABASE_RUNTIME_ROLE_UNSAFE";
    code = rejected ? 1 : 2;
    console.log(
      JSON.stringify({
        productionInitAccepted: false,
        rejection: rejected ? "role_policy" : "unavailable",
        scope: "owned-chatnest-runtime-role",
      })
    );
  } finally {
    await Promise.all(
      (["orm", "uploads"] as const).map((role) => getDatabaseClient(role).end())
    );
  }
  process.exit(code);
}
main().catch(() => {
  console.log(
    JSON.stringify({
      productionInitAccepted: false,
      rejection: "unavailable",
      scope: "owned-chatnest-runtime-role",
    })
  );
  process.exitCode = 2;
});
