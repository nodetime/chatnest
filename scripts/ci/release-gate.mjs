import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootArgument = process.argv.find((value) => value.startsWith("--root="));
const root = resolve(rootArgument ? rootArgument.slice("--root=".length) : ".");

const failures = [];
const warnings = [];
const checks = {};

function file(name) {
  const path = resolve(root, name);
  if (!existsSync(path)) {
    failures.push(`MISSING_FILE:${name}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function has(name, content, pattern) {
  const ok = pattern.test(content);
  checks[name] = ok;
  if (!ok) {
    failures.push(`CONTRACT_MISSING:${name}`);
  }
  return ok;
}

const service = file("deploy/settlement-worker.service");
const timer = file("deploy/settlement-worker.timer");
const workerEnv = file("deploy/settlement-worker.env.example");
const deploymentEnv = file("deploy/.env.example");
const runbook = file("deploy/release-checklist.md");
const packageJson = file("package.json");
const productionGate = file("scripts/ci/production-gate.mjs");
const settlementWorker = file("scripts/platform-settlement-worker.mjs");
const productionAcceptance = file("scripts/production-acceptance.mjs");
const modelAcceptance = file("scripts/model-gateway-acceptance.mjs");
const alertAcceptance = file("scripts/alert-sink-acceptance.mjs");
file("server/infrastructure/persistence/drizzle/migrate.ts");

has("script.productionGate", productionGate, /--production/);
has("script.settlementWorker", settlementWorker, /CHATNEST_CONTROL_TOKEN/);
has(
  "script.productionAcceptance",
  productionAcceptance,
  /PLATFORM_BASE_URL|billing\/health/
);
has("script.modelAcceptance", modelAcceptance, /models|chat\/completions/);
has(
  "script.alertAcceptance",
  alertAcceptance,
  /worker_failed|billing_attention/
);

has(
  "service.execStartPre",
  service,
  /ExecStartPre=.*production-gate\.mjs --production --worker/
);
has(
  "service.execStart",
  service,
  /ExecStart=.*platform-settlement-worker\.mjs/
);
has("service.oneshot", service, /Type=oneshot/);
has("service.workingDirectory", service, /WorkingDirectory=\/srv\/chatnest/);
has(
  "service.environmentFile",
  service,
  /EnvironmentFile=\/etc\/chatnest\/worker\.env/
);
has("deploymentEnv.uploadStorage", deploymentEnv, /^#?\s*UPLOAD_STORAGE_DIR=/m);
has(
  "deploymentEnv.uploadQuotas",
  deploymentEnv,
  /^UPLOAD_(?:USER|TOTAL)_QUOTA_BYTES=/m
);
has(
  "deploymentEnv.privateUploadWarning",
  deploymentEnv,
  /私有上传|private-uploads/i
);
has("service.unprivileged", service, /User=chatnest[\s\S]*Group=chatnest/);
has("service.hardening", service, /NoNewPrivileges=true[\s\S]*PrivateTmp=true/);
has("timer.persistent", timer, /Persistent=true/);
has("timer.interval", timer, /OnUnitActiveSec=60s/);
has("timer.unit", timer, /Unit=settlement-worker\.service/);

for (const name of [
  "CHATNEST_BASE_URL",
  "CHATNEST_CONTROL_TOKEN",
  "CHATNEST_ALERT_WEBHOOK_URL",
  "CHATNEST_WORKER_TIMEOUT_MS",
  "CHATNEST_SETTLEMENT_MAX_ATTEMPTS",
  "PLATFORM_MODE",
  "PLATFORM_BASE_URL",
  "PLATFORM_SERVICE_TOKEN",
]) {
  has(`workerEnv.${name}`, workerEnv, new RegExp(`^${name}=`, "m"));
}

for (const heading of [
  "production:gate",
  "production:worker:gate",
  "pnpm db:migrate",
  "pg_dump",
  "UPLOAD_STORAGE_DIR",
  "upload persistence",
  "quota",
  "systemctl",
  "health",
  "log rotation",
  "rollback",
  "model gateway",
  "alert sink",
  "provider refund",
  "payment gate",
]) {
  has(
    `runbook.${heading}`,
    runbook,
    new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
  );
}

try {
  const parsed = JSON.parse(packageJson);
  const scripts = parsed.scripts ?? {};
  for (const name of [
    "production:gate",
    "production:worker:gate",
    "db:migrate",
    "billing:acceptance",
    "model:acceptance",
    "alert:acceptance",
    "payment:gate",
  ]) {
    const ok = typeof scripts[name] === "string" && scripts[name].length > 0;
    checks[`package.${name}`] = ok;
    if (!ok) {
      failures.push(`SCRIPT_MISSING:${name}`);
    }
  }
} catch {
  failures.push("PACKAGE_JSON_INVALID");
}

if (!workerEnv.includes("TOKEN") || !workerEnv.includes("DEPLOYMENT_ID")) {
  warnings.push("WORKER_ENV_EXAMPLE_SHOULD_USE_PLACEHOLDERS");
}

const result = {
  checkCount: Object.keys(checks).length,
  checks,
  failureCount: failures.length,
  failures,
  ok: failures.length === 0,
  warningCount: warnings.length,
  warnings,
};
console.log(JSON.stringify(result));
if (!result.ok) {
  process.exitCode = 1;
}
