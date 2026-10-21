import "server-only";
import { sameOriginBrowserControl } from "../browser-policy";
import { parseEncryptionKey } from "./crypto";
import { allowedOrigins } from "./network";
export type Environment = Record<string, string | undefined>;
export class SettingsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function isAdmin(
  user: { id?: string; type?: string } | null | undefined,
  env: Environment = process.env
) {
  return Boolean(
    user?.type === "regular" &&
      user.id &&
      uuid.test(user.id) &&
      env.MCP_ADMIN_USER_IDS?.split(",")
        .map((v) => v.trim())
        .filter((v) => uuid.test(v))
        .includes(user.id)
  );
}
export function authorizeManagement(
  user: { id?: string; type?: string } | null | undefined,
  request: Request,
  write: boolean,
  env: Environment = process.env
) {
  if (!user) {
    throw new SettingsError(401, "请先登录。");
  }
  if (!user.id || !isAdmin(user, env)) {
    throw new SettingsError(403, "仅管理员可以管理工具连接。");
  }
  const sameOrigin = request.headers.has("host")
    ? sameOriginBrowserControl(request)
    : request.headers.get("origin") === new URL(request.url).origin;
  if (write && !sameOrigin) {
    throw new SettingsError(403, "请求来源不匹配。");
  }
  return user.id;
}
export function managementReady(env: Environment = process.env) {
  if (!env.MCP_SETTINGS_ENCRYPTION_KEY && !env.MCP_ALLOWED_ORIGINS) {
    return false;
  }
  parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY);
  allowedOrigins(env);
  return true;
}
