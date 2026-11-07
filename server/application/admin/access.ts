import "server-only";

import { createPlatformBillingClient } from "@/server/application/platform/client";

export type AdminEnvironment = Record<string, string | undefined>;
type AdminUser = { id?: string; type?: string } | null | undefined;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isPlatformAdmin(
  user: AdminUser,
  env: AdminEnvironment = process.env
) {
  const configuredIds = env.PLATFORM_ADMIN_USER_IDS ?? env.MCP_ADMIN_USER_IDS;
  return Boolean(
    user?.type === "regular" &&
      user.id &&
      uuid.test(user.id) &&
      typeof configuredIds === "string" &&
      configuredIds
        ?.split(",")
        .map((value) => value.trim())
        .filter((value) => uuid.test(value))
        .includes(user.id)
  );
}

export function requirePlatformAdmin(
  user: AdminUser,
  onDenied: () => never,
  env: AdminEnvironment = process.env
) {
  if (!user?.id || !isPlatformAdmin(user, env)) {
    onDenied();
  }
  return user.id;
}

/**
 * Billing/admin pages use Payload staff RBAC when the platform is connected.
 * The environment allowlist remains only as the standalone migration fallback;
 * a connected request never grants access when the platform capability probe fails.
 */
export async function resolvePlatformAdmin(
  user: AdminUser,
  env: AdminEnvironment = process.env,
  requiredRole: "admin" | "operator" = "operator"
) {
  if (!user?.id || user.type !== "regular" || !uuid.test(user.id)) {
    return false;
  }
  if (env.PLATFORM_MODE === "connected") {
    if (!env.PLATFORM_BASE_URL || !env.PLATFORM_SERVICE_TOKEN) {
      return false;
    }
    try {
      const capability = await createPlatformBillingClient({
        adminIdentity: {
          issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
          subject: user.id,
        },
        baseUrl: env.PLATFORM_BASE_URL,
        serviceToken: env.PLATFORM_SERVICE_TOKEN,
        timeoutMs: 5000,
      }).adminCapability?.();
      return (
        capability?.allowed === true &&
        (requiredRole === "operator" || capability.role === "admin")
      );
    } catch {
      return false;
    }
  }
  return isPlatformAdmin(user, env);
}
