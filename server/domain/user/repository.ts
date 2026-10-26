import type { UserRow } from "./types";

// user 仓储契约:面向领域声明,实现落 infrastructure/persistence/drizzle
export interface GuestUser {
  email: string;
  id: string;
}

export interface UserRepository {
  create: (email: string, password: string) => Promise<unknown>;
  // 创建游客账号,返回新账号的 email/id
  createGuest: () => Promise<GuestUser[]>;
  // 按邮箱查用户(含密码哈希,供鉴权比对),不存在返回空数组
  findByEmail: (email: string) => Promise<UserRow[]>;
}
