# infrastructure 基础设施层

对应 DDD 规划 R2 规则(biome 已机器强制,见根 biome.jsonc overrides)。

## 职责

- 仓储实现:domain 仓储接口的落地(P2 起在 `persistence/drizzle/`)
- 外部服务适配:数据库驱动、redis、MCP 网关、对象存储等一切外部世界

## 禁止项

- 禁止 import `@/app/**`、`next/server`、`next/headers`、`next/navigation`(R2)
- 禁止内嵌业务规则——业务判断归 domain,编排归 application;本层只做"怎么连、怎么存"

## 硬约定

- 跨层导入一律用 `@/` 别名
- P2 起建子目录:`infrastructure/persistence/drizzle/{chat,message}-repository.ts`
- 环境变量读取统一走 `@/server/shared/env`,不散落本层各文件
