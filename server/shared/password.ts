import { generateId } from "ai";
import { genSaltSync, hashSync } from "bcrypt-ts";

// 密码工具(P5 自 server/db/utils.ts 迁入,auth 哑口令与用户仓储共用)
export function generateHashedPassword(password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  return hash;
}

export function generateDummyPassword() {
  const password = generateId();
  const hashedPassword = generateHashedPassword(password);

  return hashedPassword;
}
