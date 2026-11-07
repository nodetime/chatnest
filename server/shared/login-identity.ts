import { getEnv } from "./env";

// 开发账号沿用邮箱认证与密码校验，不引入第二套用户表或认证入口。
export function getDevelopmentAccount() {
  const env = getEnv();
  if (env.NODE_ENV !== "development") {
    return null;
  }
  return {
    email: `${env.DEV_ADMIN_USERNAME}@chatnest.local`,
    password: env.DEV_ADMIN_PASSWORD,
    username: env.DEV_ADMIN_USERNAME,
  };
}

export function resolveLoginEmail(identifier: string) {
  const account = getDevelopmentAccount();
  return account && identifier === account.username
    ? account.email
    : identifier;
}
