#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
logs="$(mktemp -d "${TMPDIR:-/tmp}/chatnest-alert-history.XXXXXX")"
owned=0; started=0; cli_pid=''; server_pid=''; dist_owned=0
dist_dir="$root/.local-review/$(basename "$logs")-next"
stop_tree(){ local child; for child in $(pgrep -P "$1" 2>/dev/null || true); do stop_tree "$child"; done; kill "$1" 2>/dev/null || true; }
cleanup(){
 local code=$?;trap - EXIT
 for pid in "$cli_pid" "$server_pid";do if [ -n "$pid" ];then stop_tree "$pid";wait "$pid" 2>/dev/null || true;fi;done
 if [ "$dist_owned" = 1 ];then
  node -e 'const fs=require("node:fs"),p=process.argv[1],d=JSON.parse(fs.readFileSync(p)),prefix=process.argv[2]+"/";const before=d.include.length;d.include=d.include.filter(x=>x!==prefix+"types/**/*.ts"&&x!==prefix+"dev/types/**/*.ts");if(d.include.length!==before){const original=fs.readFileSync(process.argv[4],"utf8");fs.writeFileSync(p,JSON.stringify(d)===JSON.stringify(JSON.parse(original))?original:JSON.stringify(d,null,2)+"\n");}fs.rmSync(process.argv[3],{recursive:true});' "$root/tsconfig.json" "$NEXT_DIST_DIR" "$dist_dir" "$logs/tsconfig-before.json" || code=1
  node -e 'const fs=require("node:fs"),p=process.argv[1],before=process.argv[2],prefix=process.argv[3]+"/";if(fs.existsSync(p)){const current=fs.readFileSync(p,"utf8"),original=fs.existsSync(before)?fs.readFileSync(before,"utf8"):"";if(current.includes(prefix)){const oldLines=original.split("\n");const lines=current.split("\n").flatMap(line=>{if(!line.startsWith("import ")||!line.includes(prefix))return [line];const name=["routes.d.ts","root-params.d.ts"].find(value=>line.includes("/"+value));const replacement=oldLines.find(value=>name&&value.startsWith("import ")&&value.includes("/"+name));return replacement?[replacement]:[];});fs.writeFileSync(p,lines.join("\n"));}}' "$root/next-env.d.ts" "$logs/next-env-before.d.ts" "$NEXT_DIST_DIR" || code=1
 fi
 if [ "$owned" = 1 ];then docker exec chatnest-postgres dropdb -U chatnest --force chatnest_alert_history_acceptance >"$logs/cleanup.log" 2>&1 || code=1;fi
 if [ "$started" = 1 ];then docker compose -p chatnest-dev -f "$root/deploy/docker-compose.dev.yml" stop postgres >/dev/null || code=1;fi
 echo "Alert history acceptance logs: $logs";exit "$code"
}
trap cleanup EXIT;trap 'exit 130' INT;trap 'exit 143' TERM
if lsof -tiTCP:33382 -sTCP:LISTEN >/dev/null 2>&1;then echo 'ALERT_FIXTURE_PORT_IN_USE';exit 1;fi
if ! docker ps --format '{{.Names}}'|grep -qx chatnest-postgres;then docker compose -p chatnest-dev -f "$root/deploy/docker-compose.dev.yml" up -d --no-recreate postgres >/dev/null;started=1;fi
for i in {1..30};do docker exec chatnest-postgres pg_isready -U chatnest >/dev/null 2>&1 && break;sleep 1;done
docker exec chatnest-postgres createdb -U chatnest chatnest_alert_history_acceptance
owned=1
export POSTGRES_URL=postgres://chatnest:chatnest@127.0.0.1:55432/chatnest_alert_history_acceptance
export CHATNEST_ALERT_HISTORY_ACCEPTANCE=1 PLATFORM_MODE=standalone PLATFORM_ADMIN_USER_IDS=55555555-5555-4555-8555-555555555555
export CHATNEST_CONTROL_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export AUTH_SECRET="$CHATNEST_CONTROL_TOKEN" ALERT_ACCEPTANCE_PASSWORD="$CHATNEST_CONTROL_TOKEN"
export ALERT_ACCEPTANCE_BASE_URL=http://127.0.0.1:33382 ALERT_ACCEPTANCE_ARTIFACTS="$logs"
cd "$root"
MIGRATION_POSTGRES_URL="$POSTGRES_URL" pnpm exec tsx server/infrastructure/persistence/drizzle/migrate.ts >"$logs/migrate.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
pnpm exec tsx --conditions=react-server scripts/alert-history-acceptance.ts >"$logs/database.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
cat "$logs/database.log"
# Browser runs against this owned service and output, never a reusable developer server.
mkdir -p "$root/.local-review"
mkdir "$dist_dir"
dist_owned=1
export NEXT_DIST_DIR=".local-review/$(basename "$logs")-next"
cp "$root/tsconfig.json" "$logs/tsconfig-before.json"
if [ -f "$root/next-env.d.ts" ];then cp "$root/next-env.d.ts" "$logs/next-env-before.d.ts";fi
pnpm dev --hostname 127.0.0.1 --port 33382 >"$logs/server.log" 2>&1 & server_pid=$!
ready=0
for i in {1..60};do if ! kill -0 "$server_pid" 2>/dev/null;then break;fi;if curl -fsS --max-time 5 http://127.0.0.1:33382/login >/dev/null 2>&1;then ready=1;break;fi;sleep 1;done
if [ "$ready" != 1 ];then echo 'ALERT_FIXTURE_SERVICE_NOT_READY';exit 1;fi
pnpm exec tsx scripts/alert-history-browser-acceptance.ts >"$logs/browser.log" 2>&1 & cli_pid=$!;wait "$cli_pid";cli_pid=''
cat "$logs/browser.log"
