import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/server/shared/env";

// P3:queries.ts 的共享连接收敛至此;各域仓储实现共用同一 drizzle 实例(行为与原模块级单例一致)。
// 注意:不加 "server-only" —— 白名单测试经 tsx 直接 import 本模块链,server-only 哨兵在非 Next 运行时会炸。
const client = postgres(getEnv().POSTGRES_URL ?? "");

export const db = drizzle(client);
