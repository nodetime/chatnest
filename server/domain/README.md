# domain 领域层

对应 DDD 规划 R1 规则(biome 已机器强制,见根 biome.jsonc overrides)。

## 职责

- 领域类型:chat、message 等实体的纯类型定义
- 仓储接口:面向领域声明的持久化契约(实现落 infrastructure)
- 纯函数:无副作用、无 IO 的领域规则(如 canAccessChat)

## 禁止项

- 禁止 import 本仓库任何外层模块:`@/server/application/**`、`@/server/infrastructure/**`、`@/app/**`(R1)
- 禁止跨层相对导入 `../../**`(R1;Biome 按字符串匹配堵相对逃逸)
- 禁止直读 process.env、发起 IO、感知 HTTP——领域层对运行环境一无所知;登记例外:model/models.ts 与 attachment/refs.ts 经 shared/env 读取目录开关(isDemo/basePath),不直读

## 硬约定

- 跨层导入一律用 `@/` 别名;`../`、`./` 仅限本层内部
- 聚合清单(P7 后):chat、message(含 agent 迁入的纯规则:审批/证据账本/轮次/失败上报/Porta 错误/来源链接/输入限额)、user(含 entitlements)、vote、document(含结果表纯函数与 UIArtifact)、suggestion、attachment(上传预算/限额/引用)、model(模型目录与设置 schema)、mcp(连接管理类型/schema/editor)、admin(types)
