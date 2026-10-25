# ChatNest

## 工程纪律约束(最高顶级要求)

> 本节是全项目最高优先级要求,对 Codex、Claude 与所有协作者生效,任何任务开始前首先遵守;与其他文档、口头习惯、历史做法冲突时,以本节为准。全部条文以中文书写、中文执行。

1. **语言与署名**:对话、代码注释、提交信息一律中文;Git 遵循 Conventional Commits,作者 codeYang,禁止任何 AI 署名或 Co-Author 标记。
2. **数据库建模必须中文注释**:每张表、每个字段、每个索引/约束,都要在 `server/db/schema.ts` 写中文注释,并通过迁移的 `COMMENT ON` 语句落入数据库目录(psql `\d+`、DataGrip、ER 工具可见);新增表/列/索引同样适用,无例外。
3. **禁止 `pnpm build`**(它会先执行数据库迁移);类型检查只用 `pnpm exec tsc --noEmit`。
4. **离线测试白名单 `scripts/ci/offline-tests.txt` 只能显式追加**,不做全目录通配;禁止绕过 CI 无网隔离机制。
5. **不做付费模型/供应商调用**;mock 不进生产代码;mock 验收不冒充真实供应商验收。
6. **敏感物一律不入库**:`.env*`、密钥、`.local-review/`、日志、截图。
7. **改代码结构必须同步更新 `docs/CODEBASE_MAP.md`**(它是模块现状的权威地图)。
8. **验收纪律**:测试全绿不等于用户认可;以真实浏览器与真库实测为准;教训沉淀于 `docs/lesson.md`,不重犯。
9. **项目内永不创建 `CLAUDE.md`**:Claude Code 对 CLAUDE.md 与本文件二选一加载,创建即遮蔽本文件。

## 项目定性

- vercel/chatbot 模板的业务化分叉,Next.js 16 App Router 全栈单体(前端 / API / 业务编排同进程)。
- 2026-10-24 决策:不再跟上游,允许深度重构(含目录收敛)。
- 模块现状的权威地图是 [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md),改结构后必须同步更新它。

## 目录(已收敛)

一级目录:`app server public docs deploy tests scripts`(隐藏目录 `.github .claude .agents`)。
- `app/`:路由与页面;UI 组件在 `app/_components`,hooks 在 `app/_hooks`,前端工具在 `app/_lib`,产物客户端在 `app/_artifacts`。
- `server/`:服务端代码(db/ai/agent/uploads/admin/artifacts/config/skills/shared),单元测试就近放在对应模块旁。
- `deploy/`:部署模板与环境变量样例(vercel-template.json、.env.example)。
收敛过程记录见
[docs/superpowers/specs/2026-10-24-governance-and-convergence-design.md](docs/superpowers/specs/2026-10-24-governance-and-convergence-design.md)。

## 本地启动(Windows / Git Bash)

```
docker start chatnest-postgres        # 数据库 127.0.0.1:55432
pnpm install --frozen-lockfile        # 新环境必跑,仓库自带 node_modules 可能是旧快照
pnpm db:migrate                       # 幂等
pnpm dev --hostname 127.0.0.1 --port 3003
```

探活:`GET /ping` 返回 pong。模型未配置时聊天不可用(`/api/agent` 的 modelConfigured=false)。

## 验证

- 类型:`tsc --noEmit`
- 离线单测:按 `scripts/ci/offline-tests.txt` 串行执行(入口 `scripts/ci/offline-checks.sh`)
- CI(main 的 push/PR):lint + tests/typecheck/build,无网隔离,详见 [docs/ci-offline-checks.md](docs/ci-offline-checks.md)

## 文档导航

- [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md) 模块现状(改结构必看、必更)
- [docs/task.md](docs/task.md) 任务台账;[docs/lesson.md](docs/lesson.md) 验收教训
- [docs/integrations/](docs/integrations/) 各集成细节;[docs/superpowers/](docs/superpowers/) 逐轮 spec 与 plan
- 跨工具共享的 agent 资产放 `.agents/`(规则见 .agents/README.md);Claude 专属配置放 `.claude/`
