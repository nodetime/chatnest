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

**模型网关**:`server/application/ai/` —— model-connection/model-service/model-context/providers/prompts + model-settings/{runtime,handler,service,network,probe}(加密 ModelSettings 行/AAD/CAS,DNS 钉扎 HTTPS 探测,可选部署侧 MODEL_DNS_OVERRIDES 精确域名公网 pin(仍保留 TLS/地址校验,dns-pins.test.ts 回归);目录 schema 在 domain/model/settings-schema.ts,仓储在 drizzle)。模型目录(chatModels/isDemo/titleModel)在 `domain/model/models.ts`。

**Agent 运行时**:`server/infrastructure/mcp/` —— runtime.ts(每任务配置快照/HTTP MCP 客户端/工具发现/审批门)、config.ts(默认 agent.json + AGENT_CONFIG_PATH)、skills.ts(技能发现)。配置数据 agent.json 与技能快照(含 Porta)同层;`next.config.ts` NFT 种子指向这些路径。

**MCP 管理**:`server/application/mcp/`(api/service/security/runtime-config/projection 等 + 测试),类型/schema/editor 在 `domain/mcp/`;加密经 `shared/settings-crypto`;`/api/agent/mcp` 与 mcp-connections/mcp-editor UI 消费。

**浏览器工具**:`server/infrastructure/browser/`(session/proxy/tools,单进程内存状态);same-origin 策略在 `shared/browser-policy.ts`;BROWSER_RUNTIME=local 时启用,公开部署禁用。

**上传与文档摄取**:`server/domain/attachment/`(格式/限额/预算/引用)、`server/application/uploads/`(service/context;配额与属主校验顺序有测试断言)、`server/infrastructure/uploads/`(local-store/document-parser + document-worker.cjs 受限 worker)、`server/shared/uploads/`(validation 有界读体/security)。64 MiB 文档上限、100k 源字符模型轮预算、流式校验不留二进制。

**平台管理**:`server/application/admin/`(overview 真实就绪度,不做模型调用与活跃探测;access 属主判定);`/admin` 壳组件源自模板(MIT 见 THIRD_PARTY_NOTICES.md)。

**横切**:`server/shared/` —— env(zod 集中校验)、errors(ChatbotError 统一映射)、logger(pino JSONL 双写/轮转/脱敏 + ALS traceId)、request-context、runtime(环境判定)、telemetry(仅元数据追踪)、password、ratelimit、browser-policy、settings-crypto。

**可观测性**:proxy.ts 每请求注入 uuid7 traceId(回显响应头);logger 经 mixin 自动携带;LOG_FILE_DIR 开文件双写(10M/日轮转,保留 14 份)。

## app 层要点

- `app/(auth)/auth.ts`:NextAuth credentials/guest 会话;用户仅 id/type,无工作区角色。`app/_components/ui/` 为 shadcn/radix 既有件,复用不重造。
- 失败展示：`message.tsx` 显示持久化的单行中断状态；`conversation-notice.tsx` 承接当前传输/加载错误，同时暂隐最新持久化中断标记，关闭提示或重开后恢复历史状态，避免吞掉重新生成的新错误。已移除 `runtime-recovery.tsx`，不注入固定续跑用户消息、不重复 toast，用户通过底部输入框继续表达需求。
- 聊天主链路:`app/(chat)/api/chat/route.ts`(96 行平台层)+ 同目录 request.ts/schema.ts;业务在 application/chat/send-message.ts。
- `app/_components/ai-elements/` 钉定的 Apache-2.0 上游原语,许可全文见 THIRD_PARTY_NOTICES.md。
- 产物客户端在 `app/_artifacts/`,UI 组件 `app/_components/chat/`,hooks `app/_hooks/`,前端工具 `app/_lib/`(多为 domain 转发)。

## 正式工作空间（2026-10-27）

- `app/_components/chat/{shell,app-sidebar,greeting,workspace-home,workbench-section}.tsx` 复用原有 Sidebar/PromptInput/ModelSelector/AI Elements；72/184px 图标/展开导航，底部输入与消息/产物分别滚动。管理视图由 `app/_hooks/use-workbench-navigation.ts` 管理展示状态，不替换当前运行中的 Chat 实例。
- `app/(chat)/api/library/route.ts` 经 documents 门面读取属主最近50份文档元数据；`domain/document/library.ts` 投影不包含正文/属主，保护结果表额外校验源对话权限；首页/文件入口打开实际文档，不注入样例记录。
- `server/application/chat/tools/agent-interactions.ts` 提供 `updateTodo` / `askUser` 通用工具；`domain/message/agent-interactions.ts` 校验问题/答案、投影最新计划、编码精简续跑体。模型自行决定是否调用，未新增业务工作流引擎。
- `message-repository.mergeInteractionResponses` 用属主聊天行锁合并最新待答调用并即时落库；`updateContinuationParts` 以存储快照 CAS 防止迟到模型覆盖新轮次。复用 messages.parts，无新表/列。
- `app/_components/chat/{ask-user,task-progress,agent-pause-notice}.tsx` 复用 AI Elements Task、shadcn Popover/Button/Textarea；等待、稍后回答、修改为新补充、停止与显式继续由真实消息状态驱动。`use-active-chat` 捕获 Chat 实例及暂停修订，不把 addToolOutput 的本地 resolve 当保存成功，不继承 MCP 授权。
- 右侧仍使用 `Artifact` / 既有四类编辑器；`app/_artifacts/export.ts` 统一真实文件导出。保存/版本/metadata 回调按文档与会话 visit scope 隔离，切换不受旧请求影响。
- 上传 raw SQL client 仅对列名做 camelCase 映射，原始 JSON 不变；显式本地真库回归 `server/application/uploads/upload-lifecycle-db.test.ts` 默认跳过。
- `tests/visual/formal_workspace.py` + `.fixture.mjs` 仅在本地测试中提供模型和 MCP；生产运行时无脚本模型或合成供应商数据。

## 测试纪律

- 单元测试就近放模块旁,tsx/node:test 离线串行;白名单 `scripts/ci/offline-tests.txt`(只能显式追加)。
- 测试内开模型检查用 OPENAI_API_KEY 不用 PLAYWRIGHT(模块加载期求值会跨文件泄漏,after 钩子恢复)。
- 源码字符串断言(readSource/existsSync/require 路径)与 mock 模块映射随模块迁移同步更新;运行时 require/import 字符串路径 tsc 不查,搬目录后全局 grep。
- Windows 本地三个已知环境误报(symlink 权限/worker 时限/NTFS 0o666),与干净树一致即非回归;CI Linux 全绿为准。
- `.local-review/` 不入库;mock 验收不冒充真实供应商验收。

## 开发基座

- 一键闭环 `pnpm dev:up`(脚本 `.claude/skills/dev-env/scripts/dev-env-loop.mjs`:体检/装指引 -> .env.local -> compose PG(127.0.0.1:55432,命名卷) -> 迁移 -> 启动);收尾 `pnpm dev:down`。
- 进程工具 `scripts/governance/dev-env.mjs` 仅三能:nics / 绑 0.0.0.0:3003 启动 / 优雅杀;入口 `pnpm dev:nics|start|stop`。

## 个人能力与本次使用（2026-10-27）

- `server/application/capability/{api,personal-skills,runtime}.ts` 复用现有 MCP action/schema、发现、可信目的地和 AES-GCM；个人凭据与技能正文以 owner/kind 绑定 AAD 保存到 `capability_settings`，CAS 防并发覆盖。平台 MCP 仍由管理员维护，不下放 workspace 写权限。
- `server/infrastructure/persistence/drizzle/capability-repository.ts` 保存个人配置与 `chat_capability_scopes`；范围仓储核对 chats 属主并锁行。迁移 `0007_personal_capabilities.sql` 为两表、字段、主外键、修订约束及主键索引补齐中文注释。
- `/api/personal/{mcp,skills,scope}` 仅正式账号管理本人能力；写操作检查同源并有界读体。skills 只接受有界单文件 SKILL.md，预览/导入/编辑/启停/删除/内置副本不执行脚本、安装依赖或授予连接权限。个人引用资源包与 Git 仓库导入尚未实现。
- `readUserCatalog` 按当前用户装配平台与个人目录；`createTaskCapabilityService` 在 MCP 建连前验证并持久化 `capabilitySelection`。首次默认可用目录，省略沿用当前选择，显式空集不退回全部；审批只用服务端范围、assistant 的 data-capability-scope 修订标记，不能借客户端选择扩权。
- 个人工具别名绑定授权修订；MCP 和技能执行前复核当前配置及范围代次。纯 MCP 审批也复用 chat 行锁 merge/CAS，重复提交不再次进入执行。历史技能正文仅在本轮模型投影中替为元数据，避免关闭/编辑后旧指令仍注入；存储证据不改。公开对话不透出个人技能原始正文。
- `app/_components/chat/{personal-connections,personal-skills,task-capabilities}.tsx` 复用 McpEditor、Dialog、Button 和现有组件；侧栏与设置共用个人管理视图。`use-personal-capabilities` 与 Agent 摘要缓存均绑定登录用户，选择由 `use-active-chat` 仅在新用户轮次提交，审批续跑不重传选择。
- Ask 复用 Apache-2.0 AI Elements Question（本地仅添加 asField，避免多问题嵌套 form）；题目仍来自 askUser 工具输入，长问题区域滚动，输入框不移动。未知 MCP 原生操作名保留在审批内容/详情，不把原始参数堆在时间线。
- 普通预览与模型/MCP验收隔离；`NEXT_DIST_DIR` 可指定独立开发输出目录。`tests/visual/personal_capabilities.py` 仅接受 33379 本地夹具验收，正常预览不启动脚本模型。现有本地 browser 工具仍保留其独立审批，不属于 MCP/skills 选择集合。

## Agent 交互统一（2026-10-27）

- Ask 与 Todo 仍由 `agentInteractionTools()` 注册为 AI SDK 原生工具，模型决定是否调用。`ask-user` 复用 Question，按输入 schema 动态生成表单；已答摘要默认收起，未确认保存时显示待确认而非已回答。停止/异常后 `use-active-chat` 只读核实精确 messageId/toolCallId/答案，确认不重启生成、不重放工具；中断的 input-streaming 不冒充可回答的问题，也不解除 MCP 审批。
- `activity-groups` 仅在视图中省略成功且有效的 updateTodo 快照，原始消息保留；Todo 由 `deriveTaskProgress` 唯一投影到有界滚动的任务进度列表。普通执行组默认收起，用户展开选择与正在查看的详情保留，新的审批/错误仍主动显露。
- 原生文档/建议工具复用 ToolActivity 状态与 DocumentPreview 产物入口；只对已知原生文档工具的 `{error:string}` 契约判失败，MCP 同名字段保持源数据。消息产物卡片共用 `artifactSwitchReason`，未保存正文/表格备注或生成中阻止切到其他文件，同文件重开保留内容。
- `agent-unification.test.ts` 含实际 SDK 中止语义回归；formal_workspace 的显式扩展模式追加双产物备注保存/切换及不完整 Ask 中止分支。正常预览不使用这些夹具。

## 模型实测补齐（2026-10-27）

- `domain/message/result-evidence.ts` 的模型证据预览允许深层原始字段与最多 3 行样本，超限先缩样本，仍维持 2000 字节信封上限；来源账本不改。
- `createResultTable` 可设置通用初始 substring `filter`，返回 visibleRowCount/viewFilter；只改保存视图，原始行和来源指针仍保留，不实现业务选品流程。
- 当轮真实模型与真实 Porta 服务验收记录见 `docs/integrations/2026-10-27-real-model-verification.md`；上游仅为合成供应商数据。

## 个人入口登录（2026-10-28）

- `app/_lib/auth-navigation.ts` 白名单返回连接/技能面板；`proxy.ts` 对个人直达链接在 guest 创建前跳登录，公开登录/注册页不创建访客，不接受站外返回目标。
- `use-workbench-navigation.ts` 在导航前检查正式会话，视图缓存按用户 ID 隔离；打开个人面板不触发聊天或模型任务。
- `personal-access-gate.tsx` 覆盖设置、直达链接、会话失效；未授权不挂载管理子树，跨账号按 ID 重建子树，清除旧编辑草稿。访客侧栏明确展示登录入口。
- 登录/注册沿用 AuthForm，成功跨整页身份边界清客户端旧缓存；失败在表单内可见，不依赖聊天布局的 Toaster。
- `personal-auth.test.ts` 纳入显式离线白名单；`tests/e2e/auth.test.ts` 增加个人入口与返回链接浏览器回归。

## 中文账户页（2026-10-27，用户本地日期）

- AuthLayout 移除模板 Preview/AI Gateway 双栏演示，复用现有品牌、颜色与 Input/Button/Form，桌面与移动端均使用紧凑单表单。
- 登录、注册、返回首页、字段、按钮和提交状态统一中文；密码管理器区分 current-password/new-password，不自动打开移动端键盘，保留键盘焦点样式。
- 个人入口认证、next 白名单与回跳契约不变；认证 UI 回归与两份已有视觉测试同步使用中文选择器。

## 真实模型补验修复（2026-10-28）

- `server/infrastructure/uploads/document-worker.cjs` 从 PDF.js 包解析本地 CMaps／标准字体资源，支持中文 CID 文本 PDF；依赖追踪、禁止远程资源和原有限额保持不变。
- `server/application/uploads/service.ts` 的新对话与用户消息 raw SQL 写入采用 UTC ISO 字符串显式转 timestamp，与 Drizzle 的 UTC-naive 约定一致；不批量改写旧记录。
- `server/domain/message/message-turn.ts` 的 `projectSettledToolHistory` 只清理模型上下文中历史未完成工具；`send-message.ts` 在附件／权限投影后、SDK 转换前使用。当前真实审批续跑、终态结果、Todo 和附件保持不变；数据库审计不改。
- `message-time-db.test.ts` 为显式 opt-in、仅 loopback、独立临时 schema 的非 UTC 真库测试；默认离线 CI 跳过，不接触业务表。`tool-history.test.ts` 及中文 PDF 回归纳入显式测试白名单。
- 真实模型任务、停止／异常恢复证据及合成供应商边界见 [本轮记录](integrations/2026-10-28-real-agent-e2e.md)。

## 品牌图标（2026-10-28）

- `app/_components/brand-mark.tsx` 复用 Next Image 展示用户选定的 Figma 第一套「探索雷达」；侧栏、账户页与后台共用，产品显示名统一为「数知探AI」，保留原导航行为，装饰图像不重复朗读链接名称。
- `public/brand/radar.svg` 为原始 160×160 导出，来源／哈希见同目录 README；`app/icon.svg` 同源，favicon 与 Apple 图标等比派生。公共资源尊重 NEXT_PUBLIC_BASE_PATH，不请求 Figma 临时地址，不改 Agent／Porta／模型配置。
- 品牌回归追加至既有 `app/branding.test.ts`，继续使用原显式白名单；验证源图一致性、三个入口复用、访问命名与 basePath。

- 品牌静态资源在 `proxy.ts` 精确放行 `/brand/radar.svg`、`/icon.svg`、`/apple-icon.png`，避免公开账户页创建访客会话；任意其他资源／私有 API 权限不变。Biome 仅对两份原始 SVG 关闭格式化／属性重排，仍保留其余检查。


## 产品命名（2026-10-28）

- 产品显示名为「数知探AI」：首页链接、页面 title、账户页、后台、输入提示、内置技能归属与 Markdown 导出统一；后台标题为「数知探AI · 管理后台」。
- 仓库／技术宿主名 ChatNest、Porta、CSS 标识、日志服务名、加密 AAD 以及锁定的外部 Porta skill 快照保持不变；不重写历史用户消息、来源标题和已保存产物。
- 品牌回归覆盖新显示名、导出原文保留与内部稳定标识，既有认证／视觉选择器同步更新，不改变登录、导航或 Agent 行为。


## Lessie 工作空间呈现（2026-10-28）

- `globals.css` 的工作台语义变量统一白画布、浅中性侧栏、石墨正文和克制的选择态；展开侧栏 208px、折叠 72px，聊天/管理顶栏 52px。没有更换样式框架、字体加载或 Agent 实现。
- `shell/greeting/workspace-home` 把任务入口约束为 840px，最近对话与真实成果为并列轻列表；`SavedArtifactCards.compact` 只是同一份属主 API 数据的呈现模式，不伪造推荐或订阅能力。
- `workspace-header` 将原有通用标题/关闭/视图切换保留在 52px 主行，把产物 controls 放进独立可横向滚动的 toolbar；`artifact-picker` 明确可收缩边界。编辑器挂载、未保存保护与回调作用域不变。
- `agent-library` 复用现有 Dialog，桌面侧向分类、移动横向分类，内容独立滚动；连接与技能复用相同个人组件，改为轻列表。Ask/Todo/工具行仅调整表面，不改工具定义、审批和续跑。
- `tests/visual/lessie_workspace.py` 为显式 opt-in 的本地样式/键盘检查，只接受隔离端口33379；`formal_workspace.py` 补充长标题纯DOM边界探针和输入底部稳定断言。脚本不进入生产装配，测试模型/数据不冒充真实服务验收。

## 独立C端首页（2026-10-28）

- `app/_components/landing/`：HomeEntry按路径/个人section分流，LandingPage为独立全宽首页；LandingPreview的示例只在此页面展示，不进入聊天/证据/库；局部landing.css不改变后台或工作台主题。
- `/chat`空页复用既有聊天layout与ActiveChatProvider；`/chat/:id`不变。proxy只精确公开非个人root，旧个人root仍走认证；导航消费section后归一/chat，新对话也留在/chat。空对话跨旧root/chat不重新生成chatId，保留草稿与附件身份。
- `landing-draft.ts`为有界纯解析及先删除后消费；DraftReceiver只在身份确定后的空工作台交接草稿，不调用模型。正文不进URL，不跨正式身份，不丢已有草稿；完整页面导航保证guest/正式身份边界重新读取。
- Python脚本仅在工作台挂载，不在公开首页加载。`auth-navigation`允许/chat安全登录回跳；AuthForm用useId+登录/注册前缀处理缓存页面同时存在的标签/输入身份。
- `home.test.ts`显式纳入离线清单，`tests/visual/landing_home.py`为隔离本地页面验收，断言无模型POST；旧正式/个人/样式及E2E页对象改从/chat进入工作台。
