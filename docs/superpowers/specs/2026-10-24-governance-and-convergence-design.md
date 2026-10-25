# ChatNest 治理基座与目录收敛设计(P0 v2)

> 日期:2026-10-24
> 性质:设计定稿。本文前半(治理基座)已本轮落地;后半(P0 v2 收敛映射)仅规划,执行另开一轮。
> 前置:docs/20261019164231_chatnest技术栈基座梳理.md、docs/20261019164232_chatnest轻量DDD改造规划.md(以下称"10-19 方案")

---

## 一、已拍板决策(2026-10-24)

| 决策 | 结论 |
| --- | --- |
| 上游策略 | **不再跟 vercel/chatbot**,允许完整收敛(10-19 方案第十节遗留问题,就此关闭;上游价值按需 cherry-pick) |
| 一级目录 | 可见 7 个:`app server public docs deploy tests scripts`;隐藏:`.github .claude .agents`。对 10-19 方案的修正:`scripts/` 保留在根(CI workflow 硬引用 `scripts/ci/*`,工具链性质,挪动得不偿失) |
| 指令真源 | 根 AGENTS.md 为唯一真源;**项目内不建 CLAUDE.md** |
| .agents/ | 跨工具(Codex/Claude)共享 agent 资产 |
| 本轮范围 | 治理基座落地 + 本设计文档;P0 搬家不执行 |

### 事实依据(AGENTS.md 加载机制,已核实官方文档)

- Claude Code 自 v2.1.277 起原生读根 AGENTS.md;本机当前 2.1.258,由用户自行升级。
- 默认策略"二选一":项目内任何 CLAUDE.md 存在时会**遮蔽** AGENTS.md——因此项目内永久不建 CLAUDE.md,此约束已写入 AGENTS.md。
- Codex 一直原生读根 AGENTS.md,不受影响。

---

## 二、治理基座(本轮已落地)

### AGENTS.md(根,唯一真源)

定位:新会话 10 分钟可上手的浓缩手册,只放操作必需项,细节靠链接到 docs/。内容节:项目定性(含不跟上游决策)、目录过渡态说明、本地启动序列、硬约束、验证、文档导航、.agents/.claude 分工。用户要求刻意精简,不写长文。

### .claude/(Claude 专属)

`settings.json`(最小权限白名单,条目待用户逐条确认后补)+ README(槽位判定规则)+ `skills/ commands/ agents/` 三个空槽(README 占位,按需生长)。首个候选技能:dev 启动序列固化(/run-skill-generator)。

### .agents/(跨工具共享)

README(定位/消费方式/放不放判定)+ `skills/`(工具中立技能)+ `standards/`(双工具通用标准,空置)。核心纪律:**不复制 docs/ 已有内容**。

### 维护规则

- 改代码结构 -> 必须同步 docs/CODEBASE_MAP.md(AGENTS.md 已声明)。
- 新增跨工具资产进 .agents/,Claude 语法专属进 .claude/;两处 README 是判定依据。
- .env*、密钥、.local-review/ 永不进这两个目录。

---

## 三、P0 v2 收敛映射(规划,未执行)

在 10-19 方案 P0 基础上做增量修正;10-19 未列出的 10-20 后新增模块全部补齐:

| 现在 | 去处 | 备注 |
| --- | --- | --- |
| `components/` | `app/_components/` | 同 10-19 |
| `hooks/` | `app/_hooks/` | 同 10-19 |
| `lib/utils.ts` `lib/types.ts` `lib/constants.ts` `lib/editor/` | `app/_lib/` | 同 10-19 |
| `artifacts/*/client.tsx` `artifacts/actions.ts` | `app/_artifacts/` | 同 10-19 |
| `lib/db/` | `server/db/` | P2 再拆 infrastructure |
| `lib/ai/` | `server/ai/` | 同 10-19 |
| `lib/agent/`(含 `mcp-settings/`) | `server/agent/` | mcp-settings 整体随迁,**新增映射** |
| `lib/uploads/`(14 文件) | `server/uploads/` | **新增映射**;裸 SQL + worker 现状原样保留,repository 化留 P2/P3 |
| `lib/admin/` | `server/admin/` | **新增映射** |
| `lib/artifacts/` + `artifacts/*/server.ts` | `server/artifacts/` | **新增映射**,两处合一 |
| `lib/errors.ts` `lib/ratelimit.ts` `lib/auth-cookies.ts` | `server/shared/` | 同 10-19 |
| `skills/` `config/` | `server/` 下同名 | 同 10-19 |
| `tests/unit/*.test.ts` | 就近挪到 `server/` 对应模块旁 | 同 10-19 |
| `tests/e2e` `tests/visual` 及 fixtures | 留 `tests/` | 同 10-19 |
| `vercel-template.json` `.env.example` | `deploy/` | 同 10-19 |
| `scripts/` | **保留根** | 修正 10-19:CI 硬引用,不挪 |
| `app/` `public/` `next.config.ts` `proxy.ts` `instrumentation*.ts` `vercel.json` `components.json` | 不动 | P0 只搬运不改写 |

### 配套改动(10-19 清单 + 三处新增高危项)

1. `components.json` aliases 改指 `@/app/_components` 等(10-19 既有)。
2. `server/agent/config.ts` 读 `config/agent.json` 的默认路径同步改(既有)。
3. `biome.jsonc` 的 `files.includes` 排除路径跟随(既有)。
4. **[高危] `next.config.ts` 的 `outputFileTracingIncludes`**:`./config/agent.json`、`./skills/**/*` 改为 `./server/...`;**document-worker 的 NFT 依赖闭包与 `require.resolve` 种子路径**(现指向 `lib/uploads/document-worker.cjs` 及 pdfjs/native canvas 资源,见 CODEBASE_MAP"Vercel template/component composition"节)必须逐条改到 `server/uploads/...`——改错则线上文档解析静默失效。
5. `lib/uploads/document-parser.ts` 对 worker 文件的路径解析(相对导入/`__dirname` 类逻辑)随迁验证。
6. `tsconfig.json` 不动(`@/*` 已覆盖);import 重写用 Node 脚本 `scripts/migrate-paths.mjs`(映射表驱动,一次成型,不手改)。

### 执行纪律与验收

- 单独 PR、先跑 visual 基线截图留底、确认无并行分支。
- 验收:`tsc --noEmit` 通过;`pnpm dev` 起来且首页可访问;离线测试白名单全绿;e2e + visual 与基线一致;CI 四项通过;build 产物中确认 `server/skills/**` 存在(tracing 生效,不只看 build 成功)。
- 教训项(docs/lesson.md):验收以浏览器实测为准;Turbopack 持久缓存可能呈现陈旧 CSS,必要时移走 `.next/dev` 缓存而非加 `!important`。

### 与 10-19 方案的关系

P1(三层骨架 + biome 四条边界规则 + env 集中校验 + typecheck 脚本)、P2(chat 域切分,route.ts 525 行目标改为 **651 行 -> <100 行**)、P3(推平其余域,queries.ts 929 行/31 导出逐步掏空)、P4(双形态部署)全部沿用 10-19 方案不变,本节仅修正 P0 映射与一级目录数。

---

## 四、风险登记

| 风险 | 应对 |
| --- | --- |
| 全量 import 重写冲突面大 | 脚本化 + 单独 PR + 基线留底(沿用 10-19) |
| next.config NFT 种子路径漏改 | 列入验收:产物内容检查 + 文档解析链路 e2e |
| uploads 裸 SQL 连接串读取点分散 | 搬迁前先 grep 全部 `postgres(` 直连点登记 |
| 与上游合并通道正式关闭 | 决策已拍板,风险接受;上游修复按需 cherry-pick |
| AGENTS.md 在旧版 Claude Code 不自动加载 | 用户自行升级;升级前由会话记忆与本文档兜底 |
