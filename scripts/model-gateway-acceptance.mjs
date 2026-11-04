import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// Keep the .mjs CLI and the application's CommonJS TS graph in one context.
// Mixing ESM imports with require would duplicate AsyncLocalStorage and lose
// managed settings, even though withModelSettings loaded them successfully.
const require = createRequire(import.meta.url);
const {
  getDirectCapabilities,
  getModelConnection,
  getRuntimeModels,
} = require("../server/application/ai/model-connection.ts");
const {
  getModelEnvironment,
} = require("../server/application/ai/model-context.ts");
const {
  validateModelURL,
} = require("../server/application/ai/model-settings/network.ts");
const {
  listRemoteModels,
  probeModel,
} = require("../server/application/ai/model-settings/probe.ts");
const {
  withModelSettings,
} = require("../server/application/ai/model-settings/runtime.ts");
const {
  configurationSchema,
} = require("../server/domain/model/settings-schema.ts");
const {
  getDatabaseClient,
} = require("../server/infrastructure/persistence/drizzle/connection.ts");

async function diagnose() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length === 1 && args[0] !== "--probe-inference")
  ) {
    return {
      exitCode: 2,
      report: { code: "MODEL_DIAGNOSTIC_ARGUMENTS_INVALID" },
    };
  }
  if (
    Object.entries(process.env).some(
      ([key, value]) => key.startsWith("MODEL_GATEWAY_") && value?.trim()
    )
  ) {
    return {
      exitCode: 2,
      report: { code: "MODEL_DIAGNOSTIC_OVERRIDES_UNSUPPORTED" },
    };
  }
  try {
    return await withModelSettings(async () => {
      const env = getModelEnvironment();
      const connection = getModelConnection(env);
      // This HTTP probe never substitutes an OpenAI endpoint for the gateway SDK.
      if (connection.provider !== "openai" || !connection.configured) {
        return {
          exitCode: 2,
          report: { code: "MODEL_GATEWAY_CONFIG_REQUIRED" },
        };
      }
      const capabilities = getDirectCapabilities(env);
      const settings = {
        ...configurationSchema.parse({
          apiMode: connection.apiMode,
          baseURL: connection.baseURL,
          defaultModel: connection.modelId,
          models: getRuntimeModels(env).map(({ id }) => ({
            id,
            tools: capabilities[id].tools,
            vision: capabilities[id].vision,
          })),
        }),
        apiKey: env.OPENAI_API_KEY ?? "",
      };
      validateModelURL(settings.baseURL, env);
      const catalog = await listRemoteModels(settings, env);
      const targetListed =
        catalog.ok && catalog.models.includes(settings.defaultModel);
      const report = {
        catalog: {
          modelCount: catalog.models.length,
          ok: catalog.ok,
          reason: catalog.message,
          status: catalog.status ?? null,
          targetListed,
        },
        check: args.length ? "text" : "catalog",
        configuration: "chatnest-runtime",
        endToEndVerified: false,
        fingerprint: createHash("sha256")
          .update(`${settings.baseURL}|${settings.defaultModel}`)
          .digest("hex")
          .slice(0, 16),
        inference: { attempted: false, ok: false, status: null },
        scope: "model-gateway-diagnostic",
      };
      if (!targetListed) {
        return { exitCode: 1, report };
      }
      if (args.length) {
        const result = await probeModel(settings, env);
        report.inference = {
          attempted: true,
          ok: result.ok,
          status: result.status ?? null,
        };
        return { exitCode: result.ok ? 0 : 1, report };
      }
      return { exitCode: 0, report };
    });
  } finally {
    // The CLI owns its pool, not the caller's application process or configuration.
    if (process.env.POSTGRES_URL) {
      await getDatabaseClient().end({ timeout: 5 });
    }
  }
}

try {
  const { exitCode, report } = await diagnose();
  console.log(JSON.stringify(report));
  process.exitCode = exitCode;
} catch {
  // Never emit a DB/SDK/URL exception containing deployment credentials or response text.
  console.log(
    JSON.stringify({ code: "MODEL_DIAGNOSTIC_CONFIGURATION_UNAVAILABLE" })
  );
  process.exitCode = 2;
}
