import type { z } from "zod";
import {
  readBoundedBody,
  UploadError,
} from "@/server/shared/uploads/validation";
import { PlatformHttpError } from "./client";
import { platformRoute } from "./generated/routes";
import { OrganizationScopeSchema } from "./generated/schemas";

type OperationId = Parameters<typeof platformRoute>[0];

export function parsePlatformInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new PlatformHttpError(400, "INVALID_PLATFORM_INPUT");
  }
  return result.data;
}

export function parsePlatformQuery<T>(
  schema: z.ZodType<T>,
  params: URLSearchParams
): T {
  const values: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    // Strict Zod skips __proto__; reject it at the transport boundary.
    if (key === "__proto__" || Object.hasOwn(values, key)) {
      throw new PlatformHttpError(400, "INVALID_PLATFORM_QUERY");
    }
    values[key] = value;
  }
  return parsePlatformInput(schema, values);
}

export function platformRequestHeaders(request: Request, id: OperationId) {
  const values: Record<string, string> = Object.create(null);
  for (const parameter of platformRoute(id).parameters) {
    if (parameter.in !== "header") {
      continue;
    }
    const value = request.headers.get(parameter.name);
    if (value !== null) {
      values[parameter.name] = value;
    }
  }
  return values;
}

export async function readPlatformJson(
  request: Request,
  id: OperationId
): Promise<unknown> {
  const limit = platformRoute(id).maxBodyBytes;
  if (limit === null) {
    throw new Error("PLATFORM_BODY_NOT_DECLARED");
  }
  return await readJsonInput(request, limit);
}

/** Local browser-only JSON actions share the same bounded UTF8 reader, not a second parser. */
export async function readJsonInput(
  request: Request,
  limit: number
): Promise<unknown> {
  try {
    const bytes = await readBoundedBody(request, limit);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: Keep private parsing/stream errors outside the BFF response error.
    throw new PlatformHttpError(
      error instanceof UploadError && error.status === 413 ? 413 : 400,
      error instanceof UploadError && error.status === 413
        ? "BODY_TOO_LARGE"
        : "INVALID_JSON"
    );
  }
}

/** Only absence falls back to cookie; explicit null/empty is personal, never another wallet. */
export function resolveBrowserOrganizationScope(
  explicit: string | number | null | undefined,
  enabled: boolean,
  cookie: string | undefined
): string | undefined {
  if (!enabled) {
    if (explicit !== undefined && explicit !== null && explicit !== "") {
      throw new PlatformHttpError(403, "FEATURE_DISABLED");
    }
    return;
  }
  const value = explicit === undefined ? cookie : explicit;
  if (value === undefined) {
    return;
  }
  const parsed = parsePlatformInput(OrganizationScopeSchema, value);
  if (parsed === null || parsed === "") {
    return;
  }
  if (!Number.isSafeInteger(Number(parsed))) {
    throw new PlatformHttpError(400, "INVALID_ORGANIZATION_ID");
  }
  return String(parsed);
}
