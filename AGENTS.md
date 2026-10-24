# ChatNest

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

## 硬约束

- 禁止 `pnpm build`(会先执行数据库迁移);类型检查用 `tsc --noEmit`。
- 离线测试白名单 `scripts/ci/offline-tests.txt` 只能显式追加,不用 `tests/unit/*.test.ts` 通配。
- 不做付费模型/供应商调用;mock 不进生产代码。
- `.env*`、密钥、`.local-review/`、日志截图不提交。
- Git:Conventional Commits,作者 codeYang,不加任何 AI 署名标记。

## 验证

- 类型:`tsc --noEmit`
- 离线单测:按 `scripts/ci/offline-tests.txt` 串行执行(入口 `scripts/ci/offline-checks.sh`)
- CI(main 的 push/PR):lint + tests/typecheck/build,无网隔离,详见 [docs/ci-offline-checks.md](docs/ci-offline-checks.md)

## 文档导航

- [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md) 模块现状(改结构必看、必更)
- [docs/task.md](docs/task.md) 任务台账;[docs/lesson.md](docs/lesson.md) 验收教训(测试通过不等于用户认可)
- [docs/integrations/](docs/integrations/) 各集成细节;[docs/superpowers/](docs/superpowers/) 逐轮 spec 与 plan
- 跨工具共享的 agent 资产放 `.agents/`(规则见 .agents/README.md);Claude 专属配置放 `.claude/`
- 项目内不建 CLAUDE.md:Claude Code 与 CLAUDE.md 是二选一加载,建了会遮蔽本文件
