# application 应用层

对应 DDD 规划 R2 规则(biome 已机器强制,见根 biome.jsonc overrides)。

## 职责

- 用例编排:一个文件一个用例(如 send-message、regenerate-answer)
- 输入输出全部用 domain 层类型;流式用例返回 UIMessageStream,不返回 HTTP Response
- 通过 domain 仓储接口访问持久化(实现由 composition 注入)

## 禁止项

- 禁止 import `@/app/**`、`next/server`、`next/headers`、`next/navigation`(R2)
- 请求上下文(userId、signal、requestHints 等)一律作为参数传入,不从框架取
- 禁止直写 SQL 或 import 驱动细节——那是 infrastructure 的事

## 硬约定

- 跨层导入一律用 `@/` 别名
- P2 起按域建子目录:`server/application/chat` 等
- R2 当前范围是三层目录;P2/P3 搬完存量 27 处 next/@/app 依赖后扩大到整个 server/
