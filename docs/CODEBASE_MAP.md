# ChatNest codebase map

> 模块现状的权威地图:改结构必看、必更(AGENTS.md 纪律 6)。分层演变史与逐轮裁决见 [01_架构决策/20261025101500_DDD分层待办P1-P4.md](01_架构决策/20261025101500_DDD分层待办P1-P4.md);逐轮功能验证记录见 `docs/superpowers/plans/`。

## 顶层结构

一级目录:`app server public docs deploy tests scripts`(隐藏 `.github .claude .agents`)。四层 DDD 的接口层 = `app/`(route/proxy/actions),`server/` 一级仅五项:

```
server/
  domain/          聚合:chat、message、user、vote、document、
                   suggestion、attachment、model、mcp、admin
  application/     子域:chat(+tools)、ai(+model-settings)、
                   document、uploads、mcp、admin
  infrastructure/  persistence/drizzle、mcp、browser、skills、uploads
  shared/          横切(env/errors/logger/...)
  composition.ts   装配门面 getUseCases()
```

## 分层内容与边界(biome R1-R4 机器强制,配置在根 biome.jsonc)

- **R1**:domain 只放类型/仓储契约/纯函数,禁依赖 application、infrastructure、`@/app/**`;跨层相对导入禁用,一律 `@/` 别名。domain 各聚合自带 `types.ts`(手写领域类型,与 drizzle schema 等价,tsc 在仓储赋值处防漂移)与 `repository.ts`(仓储契约)。message 聚合收编原 agent 纯规则 15 件(approvals/approval-transport/result-evidence/message-turn/run-failure/porta-error/sources/conversation-sources/input-limits/mcp-output/task-draft/workspace-events);document 收编 result-table/stream-state/UIArtifact;attachment 收编上传预算与限额;model 收编模型目录与设置 schema。
- **R2**:整个 `server/**` 不认识 HTTP 与前端(禁 `@/app/**`、next/server|headers|navigation),请求上下文一律参数传入。
- **R3**:app 路由层零直连持久化;对基础设施的访问全部经 `composition.getUseCases()` 门面(域门面 chats/messages/votes/documents/suggestions/users + agent.readConfig/discoverSkills + browser.getSession/closeSession + registerResumeStream)。R3 豁免点仅此一处。
- **R4**:UI(`app/_components|_hooks|_lib`)只 import `server/domain` 类型;`_lib/types|utils|constants` 是指向 domain/shared 的转发 shim。
- **登记例外**:application/uploads/service.ts 自带 SQL 连接(P8 收口);domain/model/models.ts 与 domain/attachment/refs.ts 经 shared/env 读环境(isDemo/basePath);domain/message/types.ts 工具 UI 类型推导(InferUITool)行内豁免,指向 application/chat/tools。

## 关键子系统(现路径)

**持久化**:`server/infrastructure/persistence/drizzle/` —— schema.ts(中文注释纪律)、migrations/、migrate.ts(`pnpm db:migrate`)、client.ts(共享连接,不加 server-only:白名单 tsx 测试直连此链)、八仓储(chat/message/user/vote/document/suggestion/model-settings/mcp-settings)。保留不变量:advisory lock 版本化文档写入、结果表保护拒绝、chat 级联删除+资产清理、replace* 事务并发基线。`pnpm build` 先跑迁移再构建(禁止本地执行)。

**模型网关**:`server/application/ai/` —— model-connection/model-service/model-context/providers/prompts + model-settings/{runtime,handler,service,network,probe}(加密 ModelSettings 行/AAD/CAS,DNS 钉扎 HTTPS 探测;目录 schema 在 domain/model/settings-schema.ts,仓储在 drizzle)。模型目录(chatModels/isDemo/titleModel)在 `domain/model/models.ts`。

**Agent 运行时**:`server/infrastructure/mcp/` —— runtime.ts(每任务配置快照/HTTP MCP 客户端/工具发现/审批门)、config.ts(默认 agent.json + AGENT_CONFIG_PATH)、skills.ts(技能发现)。配置数据 agent.json 与技能快照(含 Porta)同层;`next.config.ts` NFT 种子指向这些路径。

**MCP 管理**:`server/application/mcp/`(api/service/security/runtime-config/projection 等 + 测试),类型/schema/editor 在 `domain/mcp/`;加密经 `shared/settings-crypto`;`/api/agent/mcp` 与 mcp-connections/mcp-editor UI 消费。

**浏览器工具**:`server/infrastructure/browser/`(session/proxy/tools,单进程内存状态);same-origin 策略在 `shared/browser-policy.ts`;BROWSER_RUNTIME=local 时启用,公开部署禁用。

**上传与文档摄取**:`server/domain/attachment/`(格式/限额/预算/引用)、`server/application/uploads/`(service/context;配额与属主校验顺序有测试断言)、`server/infrastructure/uploads/`(local-store/document-parser + document-worker.cjs 受限 worker)、`server/shared/uploads/`(validation 有界读体/security)。64 MiB 文档上限、100k 源字符模型轮预算、流式校验不留二进制。

**平台管理**:`server/application/admin/`(overview 真实就绪度,不做模型调用与活跃探测;access 属主判定);`/admin` 壳组件源自模板(MIT 见 THIRD_PARTY_NOTICES.md)。

**横切**:`server/shared/` —— env(zod 集中校验)、errors(ChatbotError 统一映射)、logger(pino JSONL 双写/轮转/脱敏 + ALS traceId)、request-context、runtime(环境判定)、telemetry(仅元数据追踪)、password、ratelimit、browser-policy、settings-crypto。

**可观测性**:proxy.ts 每请求注入 uuid7 traceId(回显响应头);logger 经 mixin 自动携带;LOG_FILE_DIR 开文件双写(10M/日轮转,保留 14 份)。

## app 层要点

- `app/(auth)/auth.ts`:NextAuth credentials/guest 会话;用户仅 id/type,无工作区角色。`app/_components/ui/` 为 shadcn/radix 既有件,复用不重造。
- 聊天主链路:`app/(chat)/api/chat/route.ts`(96 行平台层)+ 同目录 request.ts/schema.ts;业务在 application/chat/send-message.ts。
- `app/_components/ai-elements/` 钉定的 Apache-2.0 上游原语,许可全文见 THIRD_PARTY_NOTICES.md。
- 产物客户端在 `app/_artifacts/`,UI 组件 `app/_components/chat/`,hooks `app/_hooks/`,前端工具 `app/_lib/`(多为 domain 转发)。

## 测试纪律

- 单元测试就近放模块旁,tsx/node:test 离线串行;白名单 `scripts/ci/offline-tests.txt`(只能显式追加)。
- 测试内开模型检查用 OPENAI_API_KEY 不用 PLAYWRIGHT(模块加载期求值会跨文件泄漏,after 钩子恢复)。
- 源码字符串断言(readSource/existsSync/require 路径)与 mock 模块映射随模块迁移同步更新;运行时 require/import 字符串路径 tsc 不查,搬目录后全局 grep。
- Windows 本地三个已知环境误报(symlink 权限/worker 时限/NTFS 0o666),与干净树一致即非回归;CI Linux 全绿为准。
- `.local-review/` 不入库;mock 验收不冒充真实供应商验收。

## 开发基座

- 一键闭环 `pnpm dev:up`(脚本 `.claude/skills/dev-env/scripts/dev-env-loop.mjs`:体检/装指引 -> .env.local -> compose PG(127.0.0.1:55432,命名卷) -> 迁移 -> 启动);收尾 `pnpm dev:down`。
- 进程工具 `scripts/governance/dev-env.mjs` 仅三能:nics / 绑 0.0.0.0:3003 启动 / 优雅杀;入口 `pnpm dev:nics|start|stop`。
