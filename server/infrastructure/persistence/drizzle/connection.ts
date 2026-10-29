import postgres from "postgres";
import { getEnv } from "@/server/shared/env";

type Role = "orm" | "uploads";
type Client = ReturnType<typeof postgres>;
type Registry = {
  url: string;
  clients: Partial<Record<Role, Client>>;
};

// 路由 bundle 与开发热更新共享进程级池；不以模块级单例冒充进程级单例。
// 两池合计最多6连接/Node进程。多进程部署仍需按实例数预算或接入外部连接池。
const registryKey = Symbol.for("chatnest.database.pools.v1");
const host = globalThis as typeof globalThis & { [registryKey]?: Registry };

export function getDatabaseClient(role: Role = "orm"): Client {
  const url = getEnv().POSTGRES_URL ?? "";
  let registry = host[registryKey];
  if (registry && registry.url !== url) {
    // 不缓存任意连接串列表；也不把旧请求静默切换至另一数据库。
    throw new Error("数据库配置已变化，请重启服务后生效。");
  }
  if (!registry) {
    registry = { clients: {}, url };
    Object.defineProperty(host, registryKey, { value: registry });
  }
  const existing = registry.clients[role];
  if (existing) {
    return existing;
  }
  const client = postgres(url, {
    connect_timeout: 10,
    connection: { application_name: `chatnest-${role}-${process.pid}` },
    idle_timeout: 20,
    max: role === "orm" ? 4 : 2,
    max_lifetime: 1800,
    // 上传原生SQL只映射列名；ORM保留原有字段映射，JSON正文绝不重写。
    ...(role === "uploads"
      ? { transform: { column: { from: postgres.toCamel } } }
      : {}),
  });
  registry.clients[role] = client;
  return client;
}
