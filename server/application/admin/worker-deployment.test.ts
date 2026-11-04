import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const service = readFileSync("deploy/settlement-worker.service", "utf8");
const timer = readFileSync("deploy/settlement-worker.timer", "utf8");
const worker = readFileSync("scripts/platform-settlement-worker.mjs", "utf8");

test("settlement worker deployment runs as a bounded unprivileged oneshot", () => {
  assert.match(service, /Type=oneshot/);
  assert.match(service, /WorkingDirectory=\/srv\/chatnest/);
  assert.match(service, /EnvironmentFile=\/etc\/chatnest\/worker\.env/);
  assert.match(
    service,
    /ExecStartPre=\/usr\/bin\/node \/srv\/chatnest\/scripts\/ci\/production-gate\.mjs --production --worker/
  );
  assert.match(
    service,
    /ExecStart=\/usr\/bin\/node \/srv\/chatnest\/scripts\/platform-settlement-worker\.mjs/
  );
  assert.match(service, /User=chatnest/);
  assert.match(service, /Group=chatnest/);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(service, /PrivateTmp=true/);
});

test("settlement worker timer is persistent and runs once per minute", () => {
  assert.match(timer, /OnBootSec=30s/);
  assert.match(timer, /OnUnitActiveSec=60s/);
  assert.match(timer, /Unit=settlement-worker\.service/);
  assert.match(timer, /Persistent=true/);
});

test("settlement worker uses environment-provided controls and bounded alerts", () => {
  assert.match(worker, /CHATNEST_CONTROL_TOKEN/);
  assert.match(worker, /CHATNEST_WORKER_TIMEOUT_MS/);
  assert.match(worker, /CHATNEST_ALERT_WEBHOOK_URL/);
  assert.doesNotMatch(worker, /console\.log\([^)]*controlToken/);
});
