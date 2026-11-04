# Sourced only by the connected runner after its owned migration, before DML seed.
# Uncaught loader/SQL errors can also exit 1: require the actual policy result.
verify_connected_role_rejection() {
 node -e 'const fs=require("node:fs");try{const rows=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(x=>x.startsWith("{")).map(x=>JSON.parse(x));const r=rows.at(-1);if(r?.scope!=="owned-chatnest-runtime-role"||r?.productionInitAccepted!==false||r?.rejection!=="role_policy")process.exit(1)}catch{process.exit(1)}' "$1"
}
prepare_connected_runtime_role() {
 local owner_database_url="$POSTGRES_URL" runtime_password runtime_database_url
 [ "$owned" = 1 ] && [ "${CHATNEST_PLATFORM_CONNECTED_ACCEPTANCE:-}" = 1 ] && [ "$owner_database_url" = 'postgres://chatnest:chatnest@127.0.0.1:55432/chatnest_platform_connected_acceptance' ] || return 1
 runtime_role="chatnest_connected_app_$(node -e 'process.stdout.write(require("node:crypto").randomBytes(6).toString("hex"))')"
 runtime_password="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
 [[ "$runtime_role" =~ ^chatnest_connected_app_[a-f0-9]{12}$ ]] || return 1
 printf "CREATE ROLE %s LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '%s';\n" "$runtime_role" "$runtime_password" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d chatnest_platform_connected_acceptance -v ON_ERROR_STOP=1 >"$logs/runtime-role-create.log" 2>&1
 role_owned=1
 runtime_group="${runtime_role}_g"
 printf 'CREATE ROLE %s NOLOGIN;\n' "$runtime_group" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d chatnest_platform_connected_acceptance -v ON_ERROR_STOP=1 >"$logs/runtime-group-create.log" 2>&1
 group_owned=1
 runtime_database_url="postgres://$runtime_role:$runtime_password@127.0.0.1:55432/chatnest_platform_connected_acceptance"
 docker exec -i chatnest-postgres psql -X -q -U chatnest -d chatnest_platform_connected_acceptance -v "app_role=$runtime_role" <"$root/deploy/runtime-role.sql" >"$logs/runtime-role-acl.log" 2>&1
 NODE_ENV=production MIGRATION_POSTGRES_URL="$owner_database_url" pnpm exec tsx server/infrastructure/persistence/drizzle/migrate.ts >"$logs/runtime-migration-status.log" 2>&1
 # The owner must fail the same production onInit check. Never export its URL.
 if NODE_ENV=production NEXT_RUNTIME=nodejs POSTGRES_URL="$owner_database_url" pnpm exec tsx --conditions=react-server scripts/verify-connected-runtime-role.ts >"$logs/runtime-role-owner-rejected.log" 2>&1; then echo 'CONNECTED_OWNER_ROLE_WAS_ACCEPTED'; return 1; else local owner_code=$?; [ "$owner_code" = 1 ] && verify_connected_role_rejection "$logs/runtime-role-owner-rejected.log" || { echo 'CONNECTED_ROLE_AUDIT_UNAVAILABLE'; return 1; }; fi
 export POSTGRES_URL="$runtime_database_url"
 NODE_ENV=production NEXT_RUNTIME=nodejs pnpm exec tsx --conditions=react-server scripts/verify-connected-runtime-role.ts >"$logs/runtime-role-safe.log" 2>&1
 local name grant revoke unsafe_admitted=0
 while IFS='|' read -r name grant revoke; do
  printf '%s\n' "$grant" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d chatnest_platform_connected_acceptance -v ON_ERROR_STOP=1 >"$logs/runtime-role-$name-owner.log" 2>&1
  if NODE_ENV=production NEXT_RUNTIME=nodejs pnpm exec tsx --conditions=react-server scripts/verify-connected-runtime-role.ts >"$logs/runtime-role-$name-rejected.log" 2>&1; then unsafe_admitted=$((unsafe_admitted + 1)); else local audit_code=$?; [ "$audit_code" = 1 ] && verify_connected_role_rejection "$logs/runtime-role-$name-rejected.log" || { echo 'CONNECTED_ROLE_AUDIT_UNAVAILABLE'; return 1; }; fi
  if [ "$name" = schema ];then NODE_ENV=production NEXT_RUNTIME=nodejs pnpm exec tsx --conditions=react-server scripts/verify-connected-runtime-role.ts --ready-rejected >"$logs/runtime-ready-drift.log" 2>&1;fi
  printf '%s\n' "$revoke" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d chatnest_platform_connected_acceptance -v ON_ERROR_STOP=1 >>"$logs/runtime-role-$name-owner.log" 2>&1
 done <<SQL
schema|GRANT CREATE ON SCHEMA public TO $runtime_role;|REVOKE CREATE ON SCHEMA public FROM $runtime_role;
temp|GRANT TEMPORARY ON DATABASE chatnest_platform_connected_acceptance TO $runtime_role;|REVOKE TEMPORARY ON DATABASE chatnest_platform_connected_acceptance FROM $runtime_role;
trigger|GRANT TRIGGER ON public.users TO $runtime_role;|REVOKE TRIGGER ON public.users FROM $runtime_role;
journal|GRANT UPDATE ON drizzle.__drizzle_migrations TO $runtime_role;|REVOKE UPDATE ON drizzle.__drizzle_migrations FROM $runtime_role;
journal-column|GRANT UPDATE(hash) ON drizzle.__drizzle_migrations TO $runtime_role;|REVOKE UPDATE(hash) ON drizzle.__drizzle_migrations FROM $runtime_role;
setval|GRANT UPDATE ON drizzle.__drizzle_migrations_id_seq TO $runtime_role;|REVOKE UPDATE ON drizzle.__drizzle_migrations_id_seq FROM $runtime_role;
missing-dml|REVOKE UPDATE ON public.users FROM $runtime_role;|GRANT UPDATE ON public.users TO $runtime_role;
member|GRANT chatnest TO $runtime_role;|REVOKE chatnest FROM $runtime_role;
definer|CREATE FUNCTION public.owned_runtime_role_probe() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';|DROP FUNCTION public.owned_runtime_role_probe();
type-owner|CREATE TYPE public.owned_runtime_role_type AS ENUM ('probe'); ALTER TYPE public.owned_runtime_role_type OWNER TO $runtime_role;|DROP TYPE public.owned_runtime_role_type;
other-schema|CREATE SCHEMA owned_runtime_role_schema; GRANT USAGE,CREATE ON SCHEMA owned_runtime_role_schema TO $runtime_role;|DROP SCHEMA owned_runtime_role_schema;
other-definer|CREATE SCHEMA owned_runtime_role_schema; GRANT USAGE ON SCHEMA owned_runtime_role_schema TO $runtime_role; CREATE FUNCTION owned_runtime_role_schema.probe() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';|DROP SCHEMA owned_runtime_role_schema CASCADE;
parameter-set|GRANT SET ON PARAMETER session_replication_role TO $runtime_role;|REVOKE SET ON PARAMETER session_replication_role FROM $runtime_role;
parameter-system|GRANT ALTER SYSTEM ON PARAMETER log_statement TO $runtime_role;|REVOKE ALTER SYSTEM ON PARAMETER log_statement FROM $runtime_role;
set-role|GRANT CREATE ON SCHEMA public TO $runtime_group; GRANT $runtime_group TO $runtime_role WITH INHERIT FALSE, SET TRUE;|REVOKE $runtime_group FROM $runtime_role; REVOKE CREATE ON SCHEMA public FROM $runtime_group;
SQL
 if [ "$unsafe_admitted" != 0 ]; then printf '{"unsafePrivilegeProfilesAccepted":%s}\n' "$unsafe_admitted"; return 1; fi
 NODE_ENV=production NEXT_RUNTIME=nodejs pnpm exec tsx --conditions=react-server scripts/verify-connected-runtime-role.ts >"$logs/runtime-role-restored.log" 2>&1
 echo '{"runtimeRole":"nonowner","productionInit":true,"ownerRejected":true,"unsafePrivilegeProfilesRejected":15,"bothPoolsVerified":true}'
}
