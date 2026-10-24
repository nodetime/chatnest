import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText } from "ai";
import type { Environment } from "../../agent/mcp-settings/security";
import { metadataOnlyTelemetry } from "../telemetry";
import { ModelNetworkError, modelFetch } from "./network";
import type { PrivateModelSettings, ProbeResult } from "./schema";
export function connectionFailure(error: unknown): ProbeResult {
  let underlying: unknown = error;
  for (let depth = 0; depth < 4 && underlying instanceof Error; depth += 1) {
    if (underlying instanceof ModelNetworkError) {
      return { message: underlying.message, ok: false };
    }
    underlying = underlying.cause;
  }
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  const message =
    status === 401 || status === 403
      ? "鉴权失败，请检查此地址对应的 Key 与模型权限。"
      : status === 404
        ? "模型或接口不存在，请检查模型 ID、基础地址和协议。"
        : status === 429
          ? "服务限流或余额不足，请检查供应商账户。"
          : status && status >= 500
            ? "供应商网关或上游异常；这不代表 Key 无效。"
            : "连接测试未通过，请检查地址、协议、模型可用性或网络超时。";
  return { message, ok: false, ...(status ? { status } : {}) };
}
export async function probeModel(
  settings: PrivateModelSettings,
  env: Environment
): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const provider = createOpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL,
      fetch: modelFetch(settings.baseURL, env),
    });
    const result = await generateText({
      abortSignal: AbortSignal.timeout(25_000),
      maxOutputTokens: 256,
      maxRetries: 0,
      model:
        settings.apiMode === "responses"
          ? provider.responses(settings.defaultModel)
          : provider.chat(settings.defaultModel),
      prompt: "Reply with OK.",
      telemetry: metadataOnlyTelemetry,
    });
    return {
      latencyMs: Date.now() - started,
      message: result.text.trim()
        ? "模型已返回真实文本；工具与文件能力仍需任务验证。"
        : "连接成功但未返回文本，请检查模型或输出预算。",
      ok: !!result.text.trim(),
    };
  } catch (error) {
    return { ...connectionFailure(error), latencyMs: Date.now() - started };
  }
}
export async function listRemoteModels(
  settings: PrivateModelSettings,
  env: Environment
) {
  try {
    const response = await modelFetch(settings.baseURL, env)(
      `${settings.baseURL}/models`,
      {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!response.ok) {
      await response.body?.cancel();
      return {
        ...connectionFailure(
          new APICallError({
            message: "Model catalog error",
            requestBodyValues: undefined,
            statusCode: response.status,
            url: "",
          })
        ),
        models: [],
      };
    }
    const body = await response.json();
    if (!Array.isArray(body?.data)) {
      return {
        message: "服务未提供标准模型目录，可手动填写模型 ID。",
        models: [],
        ok: false,
      };
    }
    const models: string[] = [
      ...new Set<string>(
        body.data
          .map((m: { id?: unknown }) => m?.id)
          .filter(
            (id: unknown): id is string =>
              typeof id === "string" && /^[\w./:@+-]{1,200}$/.test(id)
          )
      ),
    ]
      .slice(0, 2000)
      .sort();
    return {
      message: "已获取模型目录；列出不代表具有调用权限。",
      models,
      ok: true,
    };
  } catch (error) {
    return { ...connectionFailure(error), models: [] };
  }
}
