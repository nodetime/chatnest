import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const script = new URL("./production-gate.mjs", import.meta.url);

function run(env, args = []) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ...env };
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete childEnv[key];
      }
    }
    const child = spawn(process.execPath, [script.pathname, ...args], {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        code,
        stderr,
        stdout,
        value: stdout ? JSON.parse(stdout) : null,
      })
    );
  });
}

const valid = {
  ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_URL:
    "https://notify.example.test/deletion",
  AI_GATEWAY_API_KEY: "gateway-key",
  CHATNEST_ALERT_WEBHOOK_URL: "https://alerts.example.test/chatnest",
  CHATNEST_BASE_URL: "https://chat.example.test",
  CHATNEST_CONTROL_TOKEN: "control-token",
  MCP_SETTINGS_ENCRYPTION_KEY: "mcp-key",
  NODE_ENV: "production",
  OPENAI_BASE_URL: "https://gateway.example.test/v1",
  OPENAI_MODEL: "model-prod",
  PAYMENT_CHECKOUT_BASE_URL: "https://billing.example.test/checkout",
  PLATFORM_BASE_URL: "https://platform.example.test",
  PLATFORM_MODE: "connected",
  PLATFORM_SERVICE_TOKEN: "platform-token",
  POSTGRES_URL: "postgres://user:pass@db.example.test/chatnest",
  UPLOAD_STORAGE_DIR: "/srv/chatnest/private-uploads",
};

test("production gate accepts complete non-loopback configuration", async () => {
  const result = await run(valid);
  assert.equal(result.code, 0);
  assert.equal(result.value.ok, true);
  assert.deepEqual(result.value.failures, []);
});

test("production gate rejects loopback endpoints", async () => {
  const result = await run({
    ...valid,
    CHATNEST_ALERT_WEBHOOK_URL: "http://127.0.0.1:8123/alert",
  });
  assert.equal(result.code, 1);
  assert.equal(result.value.ok, false);
  assert.ok(
    result.value.failures.includes(
      "CHATNEST_ALERT_WEBHOOK_URL_MUST_BE_PUBLIC_HTTPS"
    )
  );
});

for (const mode of ["core", "worker"]) {
  test(`${mode} gate rejects an IPv6 loopback alert receiver over HTTPS`, async () => {
    const result = await run(
      { ...valid, CHATNEST_ALERT_WEBHOOK_URL: "https://[::1]:8123/alert" },
      mode === "worker" ? ["--production", "--worker"] : ["--production"]
    );
    assert.equal(result.code, 1);
    assert.deepEqual(result.value.failures, [
      "CHATNEST_ALERT_WEBHOOK_URL_MUST_BE_PUBLIC_HTTPS",
    ]);
  });
}

test("core production gate stays usable when optional payment capability is disabled", async () => {
  const result = await run({ ...valid, PAYMENT_CHECKOUT_BASE_URL: undefined }, [
    "--production",
  ]);
  assert.equal(result.code, 0);
  assert.equal(result.value.ok, true);
  assert.ok(result.value.warnings.includes("PAYMENT_CAPABILITY_DISABLED"));
});

test("core production gate ignores payment provider configuration", async () => {
  const result = await run(
    {
      ...valid,
      PAYMENT_CHECKOUT_BASE_URL: undefined,
      PAYMENT_WEBHOOK_PROVIDERS: "stripe,synthetic",
    },
    ["--production"]
  );
  assert.equal(result.code, 0);
  assert.equal(result.value.ok, true);
});

test("payment gate is separate and fail-closed for checkout/provider configuration", async () => {
  const result = await run(
    {
      ...valid,
      PAYMENT_WEBHOOK_PROVIDERS: "stripe,synthetic",
    },
    ["--production", "--payment"]
  );
  assert.equal(result.code, 1);
  assert.ok(
    result.value.failures.includes("SYNTHETIC_PAYMENT_PROVIDER_FORBIDDEN")
  );
});

test("payment gate requires checkout and provider configuration when enabled", async () => {
  const result = await run(
    {
      ...valid,
      PAYMENT_CHECKOUT_BASE_URL: undefined,
      PAYMENT_WEBHOOK_PROVIDERS: undefined,
    },
    ["--production", "--payment"]
  );
  assert.equal(result.code, 1);
  assert.ok(
    result.value.failures.includes("PAYMENT_CHECKOUT_BASE_URL_REQUIRED")
  );
  assert.ok(
    result.value.failures.includes("PAYMENT_WEBHOOK_PROVIDERS_REQUIRED")
  );
});

test("non-production invocation is observational and does not require secrets", async () => {
  const result = await run({ NODE_ENV: "development" });
  assert.equal(result.code, 0);
  assert.equal(result.value.ok, true);
  assert.deepEqual(result.value.failures, []);
});

test("worker gate requires only deployment and alert controls", async () => {
  const result = await run(
    {
      CHATNEST_ALERT_WEBHOOK_URL: "https://alerts.example.test/chatnest",
      CHATNEST_BASE_URL: "https://chat.example.test",
      CHATNEST_CONTROL_TOKEN: "control-token",
      NODE_ENV: "production",
      PLATFORM_BASE_URL: "https://platform.example.test",
      PLATFORM_MODE: "connected",
      PLATFORM_SERVICE_TOKEN: "platform-token",
    },
    ["--production", "--worker"]
  );
  assert.equal(result.code, 0);
  assert.equal(result.value.environment, "production-worker");
  assert.deepEqual(result.value.failures, []);
});

for (const secret of ["MIGRATION_POSTGRES_URL", "POSTGRES_PASSWORD"]) {
  test(`production runtime rejects migration/master credential ${secret}`, async () => {
    const result = await run({ ...valid, [secret]: "private-not-logged" });
    assert.equal(result.code, 1);
    assert.ok(
      result.value.failures.includes("DATABASE_OWNER_CREDENTIAL_FORBIDDEN")
    );
    assert.equal(result.stdout.includes("private-not-logged"), false);
  });
}
