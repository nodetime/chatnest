#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
# The configured Porta service owns 33383/33384; disposable ChatNest never does.
connected_port=33385
connected_base="http://127.0.0.1:$connected_port"
if [ "$#" != 0 ] || [ "${PAYLOAD_CONNECTED_ACCEPTANCE:-}" != 1 ] || [ "${PAYLOAD_NATIVE_API_DB_ACCEPTANCE:-}" != 1 ] || [ "${PAYLOAD_DB_PUSH:-}" != 0 ] || [ -z "${DATABASE_URL:-}" ] || [ -z "${PAYLOAD_PLATFORM_SERVICE_TOKEN:-}" ]; then echo 'OWNED_CONNECTED_PARENT_REQUIRED';exit 1;fi
# The parent hands off only its random non-owner runtime login, never the owner DSN.
node --input-type=module -e 'import {pathToFileURL} from "node:url";const {isOwnedPayloadRuntime}=await import(pathToFileURL(process.argv[1]));if(!isOwnedPayloadRuntime(process.env.DATABASE_URL))process.exit(1)' "$root/scripts/owned-payload-runtime.mjs" || { echo 'OWNED_CONNECTED_PARENT_REQUIRED';exit 1; }
if [[ "${PAYLOAD_ROOT:-}" != /* ]] || [ ! -f "$PAYLOAD_ROOT/apps/server/scripts/fixtures/grantDatabase.ts" ];then echo 'OWNED_CONNECTED_PARENT_REQUIRED';exit 1;fi
node -e 'const fs=require("node:fs"),p=require("node:path");try{const s=fs.realpathSync(process.argv[1]);if(p.basename(s)!=="media"||!/^heymoro-native-api\.[A-Za-z0-9]+$/.test(p.basename(p.dirname(s))))process.exit(1)}catch{process.exit(1)}' "${UPLOAD_DIR:-}" || { echo 'OWNED_CONNECTED_PARENT_REQUIRED';exit 1; }
if lsof -tiTCP:"$connected_port" -sTCP:LISTEN >/dev/null 2>&1;then echo 'CONNECTED_FIXTURE_PORT_IN_USE';exit 1;fi
logs="$(mktemp -d "${TMPDIR:-/tmp}/chatnest-platform-connected.XXXXXX")"
owned=0; role_owned=0; group_owned=0; runtime_role=''; runtime_group=''; started=0; cli_pid=''; server_pid=''; dist_owned=0
dist_dir="$root/.local-review/$(basename "$logs")-next"
stop_tree(){ local child; for child in $(pgrep -P "$1" 2>/dev/null || true); do stop_tree "$child"; done; kill "$1" 2>/dev/null || true; }
cleanup(){
 local code=$?;trap - EXIT
 for pid in "$cli_pid" "$server_pid";do if [ -n "$pid" ];then stop_tree "$pid";wait "$pid" 2>/dev/null || true;fi;done
 if [ "$dist_owned" = 1 ];then
  node -e 'const fs=require("node:fs"),p=process.argv[1],d=JSON.parse(fs.readFileSync(p)),prefix=process.argv[2]+"/";const before=d.include.length;d.include=d.include.filter(x=>x!==prefix+"types/**/*.ts"&&x!==prefix+"dev/types/**/*.ts");if(d.include.length!==before){const original=fs.readFileSync(process.argv[4],"utf8");fs.writeFileSync(p,JSON.stringify(d)===JSON.stringify(JSON.parse(original))?original:JSON.stringify(d,null,2)+"\n");}fs.rmSync(process.argv[3],{recursive:true});' "$root/tsconfig.json" "$NEXT_DIST_DIR" "$dist_dir" "$logs/tsconfig-before.json" || code=1
  node -e 'const fs=require("node:fs"),p=process.argv[1],before=process.argv[2],prefix=process.argv[3]+"/";if(fs.existsSync(p)){const current=fs.readFileSync(p,"utf8"),original=fs.existsSync(before)?fs.readFileSync(before,"utf8"):"";if(current.includes(prefix)){const oldLines=original.split("\n");const lines=current.split("\n").flatMap(line=>{if(!line.startsWith("import ")||!line.includes(prefix))return [line];const name=["routes.d.ts","root-params.d.ts"].find(value=>line.includes("/"+value));const replacement=oldLines.find(value=>name&&value.startsWith("import ")&&value.includes("/"+name));return replacement?[replacement]:[];});fs.writeFileSync(p,lines.join("\n"));}}' "$root/next-env.d.ts" "$logs/next-env-before.d.ts" "$NEXT_DIST_DIR" || code=1
 fi
 if [ "$owned" = 1 ];then docker exec chatnest-postgres dropdb -U chatnest --force chatnest_platform_connected_acceptance >"$logs/cleanup.log" 2>&1 || code=1;fi
 if [ "$role_owned" = 1 ];then
  printf 'REVOKE SET ON PARAMETER session_replication_role FROM %s; REVOKE ALTER SYSTEM ON PARAMETER log_statement FROM %s; DROP ROLE %s;\n' "$runtime_role" "$runtime_role" "$runtime_role" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d postgres -v ON_ERROR_STOP=1 >>"$logs/cleanup.log" 2>&1 || code=1
 fi
 if [ "$group_owned" = 1 ];then printf 'DROP ROLE %s;\n' "$runtime_group" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d postgres -v ON_ERROR_STOP=1 >>"$logs/cleanup.log" 2>&1 || code=1;fi
 if [ "$started" = 1 ];then docker compose -p chatnest-dev -f "$root/deploy/docker-compose.dev.yml" stop postgres >/dev/null || code=1;fi
 echo "Connected acceptance logs: $logs";exit "$code"
}
trap cleanup EXIT;trap 'exit 130' INT;trap 'exit 143' TERM
if ! docker ps --format '{{.Names}}'|grep -qx chatnest-postgres;then docker compose -p chatnest-dev -f "$root/deploy/docker-compose.dev.yml" up -d --no-recreate postgres >/dev/null;started=1;fi
for i in {1..30};do docker exec chatnest-postgres pg_isready -U chatnest >/dev/null 2>&1 && break;sleep 1;done
docker exec chatnest-postgres createdb -U chatnest chatnest_platform_connected_acceptance
owned=1
export POSTGRES_URL=postgres://chatnest:chatnest@127.0.0.1:55432/chatnest_platform_connected_acceptance
export CHATNEST_PLATFORM_CONNECTED_ACCEPTANCE=1 PLATFORM_MODE=connected
export PLATFORM_BASE_URL=http://127.0.0.1:3016 PLATFORM_SERVICE_TOKEN="$PAYLOAD_PLATFORM_SERVICE_TOKEN"
export CONNECTED_ACCEPTANCE_PASSWORD="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export AUTH_SECRET="$CONNECTED_ACCEPTANCE_PASSWORD" CHATNEST_CONTROL_TOKEN="$CONNECTED_ACCEPTANCE_PASSWORD"
export AUTH_URL="$connected_base" CONNECTED_ACCEPTANCE_BASE_URL="$connected_base"
export CONNECTED_ACCEPTANCE_ARTIFACTS="$logs" CONNECTED_ACCEPTANCE_FILE="$logs/fixture.json"
export ACCOUNT_ORGANIZATIONS_ENABLED=1 PLATFORM_ADMIN_USER_IDS='' MCP_ADMIN_USER_IDS=''
# Closed loopback model endpoint; this scenario never sends a model/provider request.
export IS_DEMO=0
export MODEL_PROVIDER=openai OPENAI_API_KEY=connected-no-provider-key OPENAI_BASE_URL=http://127.0.0.1:9/v1 OPENAI_MODEL=connected-no-model-calls
export UPLOAD_STORAGE_DIR="$logs/uploads"
mkdir -p "$UPLOAD_STORAGE_DIR"
cd "$root"
MIGRATION_POSTGRES_URL="$POSTGRES_URL" pnpm exec tsx server/infrastructure/persistence/drizzle/migrate.ts >"$logs/migrate.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
source "$root/scripts/fixtures/runtime-role.sh"
prepare_connected_runtime_role
pnpm exec tsx --conditions=react-server scripts/platform-connected-seed.ts >"$logs/chatnest-seed.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
export PLATFORM_USER_ISSUER="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).issuer)' "$CONNECTED_ACCEPTANCE_FILE")"
(cd "$PAYLOAD_ROOT/apps/server" && pnpm exec tsx scripts/seed-connected-acceptance.ts seed) >"$logs/payload-seed.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
mkdir -p "$root/.local-review"
mkdir "$dist_dir"
dist_owned=1
export NEXT_DIST_DIR=".local-review/$(basename "$logs")-next"
cp "$root/tsconfig.json" "$logs/tsconfig-before.json"
if [ -f "$root/next-env.d.ts" ];then cp "$root/next-env.d.ts" "$logs/next-env-before.d.ts";fi
pnpm dev --hostname 127.0.0.1 --port "$connected_port" >"$logs/server.log" 2>&1 & server_pid=$!
ready=0
for i in {1..60};do if ! kill -0 "$server_pid" 2>/dev/null;then break;fi;if curl -fsS --max-time 5 "$connected_base/login" >/dev/null 2>&1;then ready=1;break;fi;sleep 1;done
if [ "$ready" != 1 ];then echo 'CONNECTED_FIXTURE_SERVICE_NOT_READY';exit 1;fi
curl -fsS --max-time 30 -D "$logs/runtime-ready-http.headers" "$connected_base/api/health/ready" >"$logs/runtime-ready-http.json"
node -e 'const fs=require("node:fs"),assert=require("node:assert/strict");assert.deepEqual(JSON.parse(fs.readFileSync(process.argv[1],"utf8")),{status:"ready"});assert.match(fs.readFileSync(process.argv[2],"utf8"),/cache-control: no-store/i)' "$logs/runtime-ready-http.json" "$logs/runtime-ready-http.headers"
# Prove real HTTP failure/recovery without stopping a shared container or bypassing production policy.
printf 'REVOKE SELECT ON public.users FROM %s;\n' "$runtime_role" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d chatnest_platform_connected_acceptance -v ON_ERROR_STOP=1 >"$logs/runtime-ready-revoke.log" 2>&1
ready_status=$(curl -sS --max-time 30 -D "$logs/runtime-ready-unavailable.headers" -o "$logs/runtime-ready-unavailable.json" -w '%{http_code}' "$connected_base/api/health/ready")
printf 'GRANT SELECT ON public.users TO %s;\n' "$runtime_role" | docker exec -i chatnest-postgres psql -X -q -U chatnest -d chatnest_platform_connected_acceptance -v ON_ERROR_STOP=1 >>"$logs/runtime-ready-revoke.log" 2>&1
[ "$ready_status" = 503 ] || { echo 'CONNECTED_READY_FAILURE_NOT_REPORTED';exit 1; }
node -e 'const fs=require("node:fs"),assert=require("node:assert/strict");assert.deepEqual(JSON.parse(fs.readFileSync(process.argv[1],"utf8")),{status:"not_ready"});assert.match(fs.readFileSync(process.argv[2],"utf8"),/cache-control: no-store/i)' "$logs/runtime-ready-unavailable.json" "$logs/runtime-ready-unavailable.headers"
curl -fsS --max-time 30 -D "$logs/runtime-ready-restored.headers" "$connected_base/api/health/ready" >"$logs/runtime-ready-restored.json"
node -e 'const fs=require("node:fs"),assert=require("node:assert/strict");assert.deepEqual(JSON.parse(fs.readFileSync(process.argv[1],"utf8")),{status:"ready"});assert.match(fs.readFileSync(process.argv[2],"utf8"),/cache-control: no-store/i)' "$logs/runtime-ready-restored.json" "$logs/runtime-ready-restored.headers"
pnpm exec tsx --conditions=react-server scripts/platform-connected-browser-acceptance.ts >"$logs/browser.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
(cd "$PAYLOAD_ROOT/apps/server" && pnpm exec tsx scripts/seed-connected-acceptance.ts verify) >"$logs/payload-verify.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
# The browser can outlast the normal 20s pool idle timeout. Activate both service
# pools through readiness immediately before observing them; do not change pool limits.
curl -fsS --max-time 30 "$connected_base/api/health/ready" >"$logs/runtime-ready-pre-session.json"
NODE_ENV=production NEXT_RUNTIME=nodejs pnpm exec tsx --conditions=react-server scripts/verify-connected-runtime-role.ts --live-sessions >"$logs/runtime-role-live-sessions.log" 2>&1
cat "$logs/browser.log" "$logs/payload-verify.log"
