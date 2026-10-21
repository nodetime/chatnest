import "server-only";

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
