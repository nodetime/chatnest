const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";
const workerMode = process.argv.includes("--worker");
const paymentMode = process.argv.includes("--payment");

function configured(name) {
  return (
    typeof process.env[name] === "string" && process.env[name].trim().length > 0
  );
}

function publicEndpoint(value) {
  try {
    const url = new URL(value);
    // URL.hostname retains the brackets around an IPv6 literal.
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return {
      https: url.protocol === "https:",
      loopback: loopback.has(url.hostname),
      protocol: url.protocol,
    };
  } catch {
    return { https: false, loopback: false, protocol: "invalid" };
  }
}

function requireValue(name, issues) {
  if (!configured(name)) {
    issues.push(`${name}_REQUIRED`);
  }
}

function requireHttps(name, issues) {
  requireValue(name, issues);
  if (!configured(name)) {
    return;
  }
  const endpoint = publicEndpoint(process.env[name]);
  if (!endpoint.https || endpoint.loopback) {
    issues.push(`${name}_MUST_BE_PUBLIC_HTTPS`);
  }
}

const failures = [];
const warnings = [];

if (production && paymentMode) {
  requireHttps("PAYMENT_CHECKOUT_BASE_URL", failures);
  requireValue("PAYMENT_WEBHOOK_PROVIDERS", failures);
  if (
    configured("PAYMENT_WEBHOOK_PROVIDERS") &&
    /(?:^|,)(synthetic|mock|fixture|example)(?:,|$)/i.test(
      process.env.PAYMENT_WEBHOOK_PROVIDERS
    )
  ) {
    failures.push("SYNTHETIC_PAYMENT_PROVIDER_FORBIDDEN");
  }
} else if (production && workerMode) {
  requireHttps("CHATNEST_BASE_URL", failures);
  requireHttps("CHATNEST_ALERT_WEBHOOK_URL", failures);
  requireValue("CHATNEST_CONTROL_TOKEN", failures);
  if (process.env.PLATFORM_MODE === "connected") {
    requireHttps("PLATFORM_BASE_URL", failures);
    requireValue("PLATFORM_SERVICE_TOKEN", failures);
  }
} else if (production) {
  if (["MIGRATION_POSTGRES_URL", "POSTGRES_PASSWORD"].some(configured)) {
    failures.push("DATABASE_OWNER_CREDENTIAL_FORBIDDEN");
  }
  if (process.env.PLATFORM_MODE !== "connected") {
    failures.push("PLATFORM_MODE_CONNECTED_REQUIRED");
  }
  requireHttps("PLATFORM_BASE_URL", failures);
  requireHttps("CHATNEST_BASE_URL", failures);
  requireHttps("CHATNEST_ALERT_WEBHOOK_URL", failures);
  requireHttps("OPENAI_BASE_URL", failures);
  requireValue("PLATFORM_SERVICE_TOKEN", failures);
  requireValue("CHATNEST_CONTROL_TOKEN", failures);
  requireValue("MCP_SETTINGS_ENCRYPTION_KEY", failures);
  requireValue("POSTGRES_URL", failures);
  requireValue("OPENAI_MODEL", failures);
  if (!configured("OPENAI_API_KEY") && !configured("AI_GATEWAY_API_KEY")) {
    failures.push("MODEL_PROVIDER_KEY_REQUIRED");
  }
  if (!configured("UPLOAD_STORAGE_DIR")) {
    failures.push("UPLOAD_STORAGE_DIR_REQUIRED");
  } else if (!process.env.UPLOAD_STORAGE_DIR.startsWith("/")) {
    failures.push("UPLOAD_STORAGE_DIR_MUST_BE_ABSOLUTE");
  }
  if (!configured("PAYMENT_CHECKOUT_BASE_URL")) {
    warnings.push("PAYMENT_CAPABILITY_DISABLED");
  }
  if (!configured("ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_URL")) {
    warnings.push("ACCOUNT_DELETION_NOTIFICATION_WEBHOOK_URL_NOT_CONFIGURED");
  }
} else {
  warnings.push("PRODUCTION_GATE_NOT_REQUESTED");
}

const result = {
  environment: production
    ? workerMode
      ? "production-worker"
      : "production"
    : "non-production",
  failureCount: failures.length,
  failures,
  ok: failures.length === 0,
  warningCount: warnings.length,
  warnings,
};
console.log(JSON.stringify(result));
if (failures.length > 0) {
  process.exitCode = 1;
}
