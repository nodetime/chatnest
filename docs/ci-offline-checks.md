# CI 隔离检查

面向 `main`/`master` 的 PR，以及推送到这两个分支的提交，会运行以下检查：

- **Lint / build**：沿用覆盖整个仓库的 Ultracite 检查，不只检查差异文件。
- **Offline checks / tests**：按 `scripts/ci/offline-tests.txt` 中经过审查、逐项列出的回归清单串行执行，包含运行时交互行为。测试使用假模型、模拟的外部依赖边界和本机回环 HTTP 夹具；这不是浏览器 E2E 任务。
- **Offline checks / typecheck**：执行 TypeScript 类型检查，不生成文件，也不使用增量缓存。
- **Offline checks / build**：直接执行 `pnpm exec next build --webpack`，与独立验证过的生产构建方式一致。项目的 `pnpm build` 还会执行数据库迁移，因此这里明确不使用它。

所有任务固定使用 Node **24.20.0**、pnpm **10.32.1** 和 Ubuntu **24.04**，并按锁文件安装依赖。安全辅助脚本有独立的 Node 契约测试。在引入交互改动之前的基线上，全量 lint 已通过；本次改动没有放宽 lint 规则或缩小文件覆盖范围。

## 隔离边界

安装依赖是唯一允许联网的准备阶段。该阶段不接收部署密钥，也不持久化检出代码时使用的凭据。检查在全新的 Linux 网络命名空间中执行，**只启用本机回环网络**，随后从 root 降权回运行器用户。操作系统层面禁止访问外部公网和私有网络，该限制同样覆盖原生 worker 与子进程。创建命名空间失败时，任务直接失败，不会静默退回允许联网的执行方式。

检查辅助脚本通过环境变量白名单启动每条命令，不继承数据库 URL、模型/MCP 凭据、`NODE_OPTIONS` 或云服务令牌。除 `.env.example` 外，仓库根目录只要存在 `.env`/`.env.*` 文件就会拒绝执行，但不会读取或删除这些文件。否则，Next/dotenv 可能在环境变量清空后重新载入开发者凭据。

仅供构建使用的认证、模型和数据库配置均为不含秘密的哨兵值。模型与 Postgres 端点指向本机回环地址上未开放的 9 号端口；Redis 不配置。这些检查中**不执行迁移，也不启动数据库或 Redis 服务**：离线单元回归与编译都不需要持久化服务。未来的持久化验收必须引入一次性隔离数据库并执行测试夹具所需的迁移，不能使用部署配置。

此机制用于隔离应用意外发出的网络请求，并不负责防范恶意仓库代码对 GitHub 托管运行器本身的攻击。不要向这些工作流加入密钥、`pull_request_target`、部署环境或具备特权且持久运行的自托管运行器。

## 本地复现检查

使用不含本地环境文件的全新检出目录，以及上述固定版本的工具链：

```sh
pnpm install --frozen-lockfile
node --test scripts/ci/offline-checks.test.mjs
bash scripts/ci/offline-checks.sh lint
bash scripts/ci/offline-checks.sh tests
bash scripts/ci/offline-checks.sh typecheck
bash scripts/ci/offline-checks.sh build
```

在具备 `sudo`、`unshare`、`ip` 和 `runuser` 的 Linux 环境中，将 `offline-checks.sh` 替换为 `linux-isolated-check.sh`，即可使用与 CI 相同的操作系统级网络隔离。跨平台辅助脚本会清空配置，但其本身**不限制网络流量**。不得用全目录测试通配或 `pnpm test` 代替经过审查的显式清单。

## 覆盖范围与剩余浏览器工作

已删除的“Playwright Tests”工作流曾显式注入生产部署密钥。其 `pnpm test` 命令会通过旧 Playwright 配置加载 `.env.local`，在没有隔离数据库夹具和迁移的情况下启动开发服务，并使用过时的 UI 假设，例如 `suggested-actions` 和英文 `Search models...`。这些测试目前不能证明所要求的运行时验收已完成。

`server/infrastructure/browser/browser-runtime.test.ts`（真实外部浏览器导航）与 `server/infrastructure/persistence/drizzle/regeneration-db.test.ts`（通过 dotenv 加载配置并连接真实 Postgres）被有意排除在离线清单之外。新的离线套件必须经过审查后逐项加入，不能通过通配符自动纳入。

运行时交互的浏览器/HTTP 夹具验证，仍由主会话验收单独记录在运行时交互计划下。仅通过这些 CI 任务，**不能宣称**已验证真实浏览器中的批准、拒绝、停止、恢复，也不能宣称已完成真实供应商验收或证明数据库持久化正确。未来的浏览器 CI 任务必须先迁移当前确定性的测试夹具，使用一次性存储、本机回环模型/MCP 端点及持续维护的选择器，之后才能称为 Playwright 覆盖。

分支保护管理员应检查是否仍有以已删除 Playwright 任务命名的必需检查，并通过正常的仓库管理流程配置新检查。不得绕过分支保护，也不得仅为满足过时的必需检查名称而将离线任务标记为“Playwright”。
