# ChatNest：实现与开发说明

当前维护范围为已经验收的独立 Web 演示：ChatNest 承接应用前后端，通过 MCP 调用 Porta，数据保存在 PostgreSQL。Payload 接入和 CLI 开发暂停。Goal、待办、版本及验收结果只记录在[唯一研发 TODO](superpowers/plans/2026-11-04-core-launch-goal-and-todo.md)；本文说明实现与操作，不维护第二份状态或历史计划。

## 运行架构

ChatNest 基于 `vercel/chatbot`，沿用 Next.js、Vercel AI SDK、认证、流式会话和文档产物。ChatNest 本身包含后端，无需启动 Payload 即可运行当前演示。应用结构见[代码库地图](CODEBASE_MAP.md)。

| 部分 | 职责 |
| --- | --- |
| ChatNest | 首页、登录、对话、附件、Agent 编排、右侧产物和应用设置 |
| PostgreSQL / 私有上传目录 | 会话、消息、产物及附件的持久保存 |
| 模型服务 | 当前演示配置的真实 DeepSeek Flash；供应商凭据只在私有环境中保存 |
| Porta HTTP MCP | 当前仅启用百炼 1688 商品查询，不接入其他供应商 |
| Exa HTTP MCP | 网页搜索和读取；Tavily 当前关闭 |

外部服务的配置状态不代表调用成功。readiness 只检查应用数据库就绪；模型、MCP 和业务输出以对应实际会话为准。

## 本地开发

优先按 [README](../README.md#本地运行) 操作。ChatNest 自带的开发入口为：

```sh
pnpm dev:up
pnpm dev:stop
pnpm dev:down
```

`dev:up` 处理 ChatNest 依赖体检、开发数据库、迁移、开发账号和应用进程，不自动启动同级 Porta。Porta 在其仓库按自己的开发命令启动，ChatNest 通过 `PORTA_MCP_URL` 和 `PORTA_SERVICE_TOKEN` 连接；配置方法见 [Porta 接入说明](integrations/porta.md)。开发地址约定为 ChatNest `http://127.0.0.1:3003`、Porta `http://127.0.0.1:3334`，不是进程实时状态。

开发账号 `admin / 123456` 仅由显式启用的 development 初始化创建，可通过 `DEV_ADMIN_USERNAME`、`DEV_ADMIN_PASSWORD` 配置。服务器演示使用该环境单独设置的账户，不自动创建开发账户。

ChatNest 私密配置放在忽略的 `.env.local` 中；Porta 使用其根目录私密环境文件。保留同一个 `AUTH_SECRET`，避免开发重启导致已有会话失效。迁移只使用显式的 `MIGRATION_POSTGRES_URL`，运行进程使用 `POSTGRES_URL`；操作已有数据库前确认目标。停止开发环境保留数据，不将清库作为普通重启步骤。

附件沿用当前私有存储配置，演示使用私有本地目录或卷；模型是否支持图片需按实际能力配置。附件类型、数量和大小以当前上传校验与环境配置为准，不额外要求旧版 Blob 凭据。

## Agent 分层

| 层 | 当前实现 |
| --- | --- |
| 通用核心 Prompt | `server/application/ai/core.md`，保持通用任务执行和交互原则 |
| 业务 Skill | `server/infrastructure/skills/similar-products/SKILL.md`，按需加载相似检索、比较及表格交付方法 |
| Ask / Todo | 复用 AI SDK 工具和现有交互组件；Ask 补实质信息，Todo 展示多步骤工作的真实进度 |
| 自动计算 | `executeCode` 执行隔离 JavaScript，不提供宿主文件、网络或 shell 能力 |
| 图片查看 | `viewImage` 读取当前会话已有 MCP 结果中的候选图片，供视觉比较 |
| MCP | 官方客户端发现并调用已配置工具，允许的只读查询自动执行 |
| 产物 | 原生文档工具与右侧工作区；相似商品比较采用 sheet/CSV，保存、续改和下载共用实际正文 |

业务 SOP 放 Skill，工具能力放实际 schema 与 MCP，不把商品规则写入核心 Prompt，不另建固定业务流水线或第二套 Agent 引擎。网页及工具返回内容不作为系统指令。

图片案例当前使用视觉理解、文字召回、候选看图比较，不描述为 1688 原生上传图搜；CSV 不描述为 XLSX。☑️ 表示本行比较依据和来源已核对，不等于材质、供货关系或侵权结论已经证实。

## 界面与执行约定

- 缺少影响任务的实质信息时才使用 Ask；已有充分参照时直接执行。用户不需要为每个已允许的只读查询重复确认。
- Todo 显示真实任务快照，不伪造完成。步骤、时限和输出大小沿用现有运行边界，不另外添加用户累计调用次数限制。
- 聊天简短交接结果，比较明细在右侧表格，原始参数和错误细节在工具详情。失败或信息不足如实呈现，不补造候选、来源或核实状态。
- 消息请求被接受后清空该轮输入；失败恢复草稿且不覆盖新输入。侧栏重开读取已保存消息和产物，不重新发送或执行工具。
- 工作在当前会话内进行；停止、关闭页面或进程重启不等于后台任务仍在执行。内置浏览器默认关闭，启用与限制见现有浏览器模块说明，不作为当前演示验收条件。

演示步骤见[操作手册](demo-cases.md)，结果与证据见唯一 TODO。手册中的预期案例不等于已经验收通过。

## 验证与交付

根据具体变更运行受影响的回归，类型检查使用：

```sh
pnpm typecheck
```

本机禁止运行 `pnpm build`，因为它会触发迁移。隔离 CI 的构建和镜像发布沿用现有工作流，交付方式见 [Docker 说明](../deploy/docker-handoff.md)。离线测试使用显式白名单，不使用整目录通配。

真实模型和供应商调用可能收费，按用户授权集中验证，不为文档更新、重开会话或重复汇报重新调用。夹具测试只证明对应规则，不作为真实服务验收。

`.env*`、密钥、日志、截图和 `.local-review/` 不提交。修改保持单一实现路径，不新增兼容层或恢复已暂停任务。当前 `origin` 为 `nodetime/chatnest`；按 `AGENTS.md` 的工程纪律及唯一 TODO 的范围工作，不从历史上游记录生成新待办。功能分支提交、推送、镜像发布和部署是不同操作，按当前用户指令执行，不自动合并 main。
