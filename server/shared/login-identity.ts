import { getEnv } from "./env";

// 种子账号沿用邮箱认证与密码校验，DEV_ADMIN_* 同时供显式种子入口使用。
export function getSeedAccount() {
  const env = getEnv();
  return {
    email: `${env.DEV_ADMIN_USERNAME}@chatnest.local`,
    password: env.DEV_ADMIN_PASSWORD,
    username: env.DEV_ADMIN_USERNAME,
  };
}

export function getDevelopmentAccount() {
  if (getEnv().NODE_ENV !== "development") {
    return null;
  }
  return getSeedAccount();
}

export function resolveLoginEmail(identifier: string) {
  const account = getDevelopmentAccount();
  return account && identifier === account.username
    ? account.email
    : identifier;
}
