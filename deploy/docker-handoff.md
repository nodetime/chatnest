# ChatNest Docker 交付

研发本地沿用 [README](../README.md) 的 PostgreSQL、迁移和 `pnpm dev`，不依赖生产镜像或集群。此处的 Docker 命令交给有构建和部署权限的环境执行。

## 当前独立演示

`feat/**` tag 触发 `.github/workflows/demo-images.yml`，只发布 `linux/amd64` 的应用、迁移与执行镜像到 GHCR，标签为 `sha-完整提交SHA`。Porta 使用它自己仓库的同类工作流；不把源码或私有配置复制进其他仓库。服务器从镜像启动，不在服务器构建源码。

[compose.demo.yml](compose.demo.yml) 作为独立项目运行：PostgreSQL、Porta、Porta 内网 TLS 代理和 ChatNest，以及仅内部可达的命令执行 broker。只向宿主机 loopback 的 `3340` 绑定应用端口；既有入口代理再按独立域名转发。数据库和 MCP 不开放宿主端口，不改现有站点。broker 固定128MiB，最多保留4个会话容器各256MiB（0.5 CPU、64 PID、无网络与宿主挂载），同时最多执行2条命令；合计需另预留1152MiB，日志每容器最多10MiB；迁移为一次性任务。

在服务器专用目录准备以下私密文件（均不进入 Git）：

- `.env`：`CHATNEST_IMAGE`、`CHATNEST_MIGRATOR_IMAGE`、`PORTA_IMAGE` 以及 `CHATNEST_EXECUTION_IMAGE` 四个不可变镜像地址。
- `execution.env`：随机 `EXECUTION_SERVICE_TOKEN`，与 `app.env` 相同；不带模型、数据库或 MCP 凭据。Docker socket 仅挂载 broker，执行 API 不公开宿主端口，命令容器没有该 socket。运行镜像预先由部署环境拉取，broker 不接受模型指定镜像、挂载或 Docker 参数。
- `database.env`：专属空库的 owner 配置；`migration.env` 仅保存该库的迁移连接。
- `app.env`：`AUTH_URL`、随机 `AUTH_SECRET`、非 owner 的 `POSTGRES_URL`、真实 Flash 模型配置、上传配额、`PLATFORM_MODE=standalone`。`PORTA_MCP_URL=https://porta-tls/mcp`，服务 token 与 Porta 相同；不复制本机 Fake-IP DNS pins 或开发 HTTP 开关。
- `porta.env`：随机服务 token、百炼凭据、`PORTA_ALLOWED_HOSTS=porta-tls,localhost`、`PORTA_PROVIDERS=none`、`PORTA_NATIVE_MCP_SERVICES=alibaba1688_product`、`PORTA_NATIVE_MCP_TOOLS={"alibaba1688_product":["find_product"]}`，其他供应商保持关闭。允许的主机名须与内网 TLS 代理转发的 Host 一致。
- `tls/ca.crt`、`tls/porta.crt`、`tls/porta.key`：本项目专用 CA 和包含 `DNS:porta-tls` 的服务证书；应用只挂载 CA，私钥只挂载到内网代理。使用现有 HTTPS 校验路径，不放宽生产连接策略。

先启动数据库，用同版 migrator 初始化空库，再创建非 owner 运行角色并应用 `runtime-role.sql`；随后启动其余服务并确认 readiness。生产镜像不创建 `admin/123456`；演示账户在该独立空库单独初始化，凭据私下交接。公开入口使用独立有效证书，不修改其他域名的 SSL 设置。具体版本和实际验收状态只记[唯一 TODO](../docs/superpowers/plans/2026-11-04-core-launch-goal-and-todo.md)。

## 构建交付物

从干净的 ChatNest 发布检出根目录（不带本地环境文件、工作树或测试产物），用同一个发布标识构建三份镜像：

```sh
RELEASE=local
docker build --target app -t "chatnest:${RELEASE}" .
docker build --target migrator -t "chatnest-migrator:${RELEASE}" .
docker build --target execution -t "chatnest-execution:${RELEASE}" .
```

应用镜像监听容器端口 3000，以非 root 用户运行。依赖安装后，编译复用 CI 的断网构建入口：Next 收集页面数据时只使用不可连接的 loopback 占位配置，不注入实际 env 或凭据，也不跑迁移。镜像包含现有 worker 入口，不在 Web 进程里自动启动 worker。

验收口径：从干净的源码构建应用、迁移和执行三份镜像，在专属空 PostgreSQL 库运行完整迁移链；以非 owner 数据库账号启动应用并验证 readiness。演示入口另验真实模型和 MCP 调用，readiness 仅代表数据库就绪。历史 0017→0018 告警删除回归不替代空库初始化。

## 通用配置与启动顺序

以下 `production-gate --production` 仅用于 connected 平台交付，要求平台服务配置；standalone 演示按上面的独立 Compose 流程初始化与验收，不启用该门禁或结算 worker。

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
