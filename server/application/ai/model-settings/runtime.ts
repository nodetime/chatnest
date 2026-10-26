import "server-only";
import {
  getModelEnvironment,
  hasModelEnvironment,
  runWithModelEnvironment,
} from "../model-context";
import { createModelSettingsService } from "./service";
export async function withModelSettings<T>(
  action: () => T
): Promise<Awaited<T>> {
  if (hasModelEnvironment()) {
    return await action();
  }
  const env = { ...getModelEnvironment() };
  const settings = await createModelSettingsService({ env }).load();
  if (settings) {
    Object.assign(env, {
      MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: settings.apiKey,
      OPENAI_API_MODE: settings.apiMode,
      OPENAI_BASE_URL: settings.baseURL,
      OPENAI_MANAGED_CONNECTION: "1",
      OPENAI_MANAGED_MODELS: JSON.stringify(settings.models),
      OPENAI_MODEL: settings.defaultModel,
    });
  }
  return await runWithModelEnvironment(env, action);
}
