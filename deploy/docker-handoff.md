# ChatNest Docker 交付

研发本地沿用 [README](../README.md) 的 PostgreSQL、迁移和 `pnpm dev`，不依赖生产镜像或集群。此处的 Docker 命令交给有构建和部署权限的环境执行。

## 构建交付物

从干净的 ChatNest 发布检出根目录（不带本地环境文件、工作树或测试产物），用同一个发布标识构建两份镜像：

```sh
RELEASE=local
docker build --target app -t "chatnest:${RELEASE}" .
docker build --target migrator -t "chatnest-migrator:${RELEASE}" .
```

应用镜像监听容器端口 3000，以非 root 用户运行。依赖安装后，编译复用 CI 的断网构建入口：Next 收集页面数据时只使用不可连接的 loopback 占位配置，不注入实际 env 或凭据，也不跑迁移。镜像包含现有 worker 入口，不在 Web 进程里自动启动 worker。

验收口径：从干净的源码构建两个镜像，在隔离 PostgreSQL 上从 0017 升至 0018，确认旧告警表消失；以非 owner 数据库账号启动应用并验证 readiness。以实际目标架构复核镜像，不把本地验收视为正式环境验收。

## 配置与启动顺序

1. 以 [应用 env 模板](.env.example)和[迁移 env 模板](migration.env.example)为准，在交付环境分别注入配置。仅迁移任务持有 `MIGRATION_POSTGRES_URL`；应用只持有非 owner 的 `POSTGRES_URL`。不要把 env 文件打进镜像或传入构建参数。
2. 备份目标库后，用同版 migrator 镜像运行一次迁移；由 DBA 按 [runtime-role.sql](runtime-role.sql) 授予运行账号权限。失败时不要启动新应用。
3. 将持久卷挂载到 `/var/lib/chatnest/uploads`，使用容器 `node` 用户的 UID／GID，目录模式 `0700`；镜像内目录权限不代表绑定挂载后的实际权限。模型和平台服务配置由运维注入；后台诊断由运行环境采集标准输出和标准错误。保持支付关闭时，从应用环境省略 `PAYMENT_CHECKOUT_BASE_URL`（不要保留示例值或设置为空字符串）；不配置真实供应商凭据。
4. 按[发布清单](release-checklist.md)运行核心门禁；启动应用后以 `GET /api/health/ready` 的 200 作为就绪条件。若启用结算 worker，使用同一应用镜像、独立 worker env，并由运维调度 `node scripts/platform-settlement-worker.mjs`；应用容器内不运行 systemd。默认不启用应用内置 Chromium；如需启用，另按现有浏览器运行配置提供浏览器和系统依赖。

示意命令（先按环境设置 `NETWORK`、`MIGRATION_ENV_FILE`、`APP_ENV_FILE` 和 `UPLOAD_VOLUME`）：

```sh
docker run --rm --network "$NETWORK" --env-file "$MIGRATION_ENV_FILE" "chatnest-migrator:${RELEASE}"
docker run --rm --network "$NETWORK" --env-file "$APP_ENV_FILE" \
  "chatnest:${RELEASE}" node scripts/ci/production-gate.mjs --production
docker run --rm --network "$NETWORK" --env-file "$APP_ENV_FILE" \
  --mount "type=volume,source=$UPLOAD_VOLUME,target=/var/lib/chatnest/uploads" \
  "chatnest:${RELEASE}"
```
