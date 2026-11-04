import { type Env, getEnv } from "@/server/shared/env";
import { getDatabaseClient } from "./connection";

const checks = [
  "roleSafe",
  "ownershipSafe",
  "ddlSafe",
  "journalSafe",
  "sequencesSafe",
  "functionsSafe",
  "permissionsReady",
] as const;

type AuditClient = { unsafe: (query: string) => PromiseLike<unknown> };

/** Fixed, read-only catalog audit; neither migrates nor repairs grants. */
export async function enforceRuntimeDatabaseRole(
  client: AuditClient,
  env: Pick<
    Env,
    "NODE_ENV" | "MIGRATION_POSTGRES_URL" | "POSTGRES_PASSWORD"
  > = getEnv()
): Promise<void> {
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (
    ["MIGRATION_POSTGRES_URL", "POSTGRES_PASSWORD"].some(
      (key) => env[key as "MIGRATION_POSTGRES_URL" | "POSTGRES_PASSWORD"]
    )
  ) {
    throw new Error("DATABASE_RUNTIME_ROLE_UNSAFE");
  }
  let rows: unknown;
  try {
    rows = await client.unsafe(`
      WITH relations AS (
        SELECT c.oid,c.relname,c.relkind,c.relowner,n.nspname FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle')
      )
      SELECT
        current_user=session_user AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin
            AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname<>session_user AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER')
        ) AND pg_catalog.current_setting('session_replication_role')='origin'
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_settings s WHERE s.context IN ('superuser','superuser-backend') AND pg_catalog.has_parameter_privilege(session_user,s.name,'SET'))
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_parameter_acl a WHERE pg_catalog.has_parameter_privilege(session_user,a.parname,'ALTER SYSTEM')) AS "roleSafe",
        NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database() AND pg_catalog.pg_has_role(session_user,datdba,'MEMBER'))
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_shdepend d WHERE d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
            AND d.refclassid='pg_catalog.pg_authid'::pg_catalog.regclass AND d.deptype='o' AND pg_catalog.pg_has_role(session_user,d.refobjid,'MEMBER')
        ) AS "ownershipSafe",
        NOT pg_catalog.has_database_privilege(session_user,pg_catalog.current_database(),'CREATE,TEMP')
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE pg_catalog.has_schema_privilege(session_user,n.oid,'CREATE'))
        AND NOT EXISTS (SELECT 1 FROM relations WHERE relkind IN ('r','p') AND (
          pg_catalog.has_table_privilege(session_user,oid,'TRUNCATE,TRIGGER,REFERENCES') OR pg_catalog.has_any_column_privilege(session_user,oid,'REFERENCES')
        )) AS "ddlSafe",
        NOT EXISTS (SELECT 1 FROM relations WHERE nspname='drizzle' AND (
          (relkind IN ('r','p') AND (pg_catalog.has_table_privilege(session_user,oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR pg_catalog.has_any_column_privilege(session_user,oid,'INSERT,UPDATE,REFERENCES')))
          OR (relkind='S' AND pg_catalog.has_sequence_privilege(session_user,oid,'USAGE,UPDATE'))
        )) AS "journalSafe",
        NOT EXISTS (SELECT 1 FROM relations WHERE relkind='S' AND pg_catalog.has_sequence_privilege(session_user,oid,'UPDATE')) AS "sequencesSafe",
        NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prosecdef AND pg_catalog.has_schema_privilege(session_user,n.oid,'USAGE') AND pg_catalog.has_function_privilege(session_user,p.oid,'EXECUTE')) AS "functionsSafe",
        pg_catalog.has_database_privilege(session_user,pg_catalog.current_database(),'CONNECT') AND pg_catalog.has_schema_privilege(session_user,'public','USAGE')
        AND (SELECT count(*) FROM relations WHERE nspname='public' AND relkind IN ('r','p') AND relname IN ('users','execution_operations','settlement_outbox','upload_assets'))=4
        AND EXISTS (SELECT 1 FROM relations WHERE nspname='drizzle' AND relname='__drizzle_migrations' AND relkind='r')
        AND pg_catalog.has_schema_privilege(session_user,'drizzle','USAGE')
        AND NOT EXISTS (SELECT 1 FROM relations WHERE nspname='drizzle' AND relkind IN ('r','p') AND NOT pg_catalog.has_table_privilege(session_user,oid,'SELECT'))
        AND NOT EXISTS (SELECT 1 FROM relations WHERE relkind IN ('r','p') AND nspname='public' AND NOT (
          pg_catalog.has_table_privilege(session_user,oid,'SELECT') AND pg_catalog.has_table_privilege(session_user,oid,'INSERT')
          AND pg_catalog.has_table_privilege(session_user,oid,'UPDATE') AND pg_catalog.has_table_privilege(session_user,oid,'DELETE')
        ))
        AND NOT EXISTS (SELECT 1 FROM relations WHERE relkind='S' AND nspname='public' AND NOT (
          pg_catalog.has_sequence_privilege(session_user,oid,'USAGE') AND pg_catalog.has_sequence_privilege(session_user,oid,'SELECT')
        )) AS "permissionsReady"
    `);
  } catch {
    // biome-ignore lint/style/useErrorCause: never attach driver errors containing connection details to an operational failure.
    throw new Error("DATABASE_RUNTIME_ROLE_UNAVAILABLE");
  }
  const state = Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined;
  if (!state || checks.some((key) => state[key] !== true)) {
    throw new Error("DATABASE_RUNTIME_ROLE_UNSAFE");
  }
}

/** Both existing pools share one POSTGRES_URL and one policy, without caching. */
export async function checkDatabaseReadiness(): Promise<void> {
  const env = getEnv();
  await Promise.all(
    (["orm", "uploads"] as const).map(async (role) => {
      const client = getDatabaseClient(role);
      await enforceRuntimeDatabaseRole(client, env);
      await client`SELECT 1 FROM public.users LIMIT 1`;
    })
  );
}
