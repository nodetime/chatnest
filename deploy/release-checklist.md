# ChatNest 发布级验收清单

## 数据库运行/迁移身份（2026-11-03）

1. 构建仅 `next build`，与迁移分开；本地工程纪律仍禁止运行 build，本轮没有构建/发布正式镜像。
2. PG16 专属数据库：DBA 预建干净直接 LOGIN（非 owner/superuser、无 group/SET ROLE/高权参数），密码由私有 secret 管理。迁移身份仍拥有 schema，应用运行身份从不拥有数据库/对象。
3. 在独立迁移环境注入 `MIGRATION_POSTGRES_URL`，执行 `pnpm db:migrate`；Drizzle 管理命令同样只读该变量，无 `POSTGRES_URL` fallback。随后在同一目标数据库以 DBA 执行 `psql "$MIGRATION_POSTGRES_URL" --no-psqlrc -v app_role=chatnest_app -f deploy/runtime-role.sql`。不要把迁移环境带入 app 的启动命令；样例 `deploy/migration.env.example` 不含真实值。
4. app 只注入非 owner `POSTGRES_URL`。`production:gate` 和生产启动审计拒绝非空 `MIGRATION_POSTGRES_URL`/`POSTGRES_PASSWORD`；生产连接拒绝空运行 URL，避免默认 `PG*` 连接。runtime 不改密码、DDL 或 ACL；权限漂移 fail closed，由 DBA 明确处理，不自动修复旧角色/继承/column grant。
5. 启动：Next Node production instrumentation 等待两个现有池的同一只读审计后再注册 telemetry；构建阶段不连库。ready：无登录 `GET /api/health/ready` 返回 ready200 或 not_ready503，固定 no-store，无角色名/连接细节；上线健康检查与流量门禁使用此路径，不使用仅证明进程存活的 ping。初始化失败本身可能导致启动失败/非2xx，不保证冷启动能返回 ready DTO。
6. ACL 只授 public 业务表 SELECT/INSERT/UPDATE/DELETE、业务 sequence USAGE/SELECT，drizzle 全部 journal 表仅 SELECT；不授 schema/DB CREATE、TEMP、TRIGGER、TRUNCATE、REFERENCES、setval。全部当前库对象 ownership、任何非自身 MEMBER（包括 NOINHERIT SET ROLE）、参数高权、可达非系统 SECURITY DEFINER 都拒绝。新迁移增加对象后要重跑 ACL；不加默认权限兼容路径。该策略不替代业务授权/注入防护，不是任意 SQL sandbox。
7. 开发 `dev:up` 只对唯一且无父环境异址覆盖的精确本地开发 URL，向迁移子进程显式传该 compose 的 DBA 身份；不改既有 `.env.local`，不把 DBA URL传入随后 Next 子进程。独立手工迁移同样须显式配置 MIGRATION_POSTGRES_URL。

C 端用户、Admin 和后台仍使用现有页面与业务授权；角色隔离不新增页面/付费依赖、不授予用户额度。支付可选，未付不授信。source 与 owned loopback 验收不等于正式环境已经部署，正式镜像、DBA ACL、凭据注入/轮换、ready 流量门禁仍需独立验收。

这份清单是 `scripts/ci/release-gate.mjs` 的静态发布契约；它不执行迁移、不读取 secret，也不把 loopback/fixture 结果当作生产证据。

## 1. Preflight

1. 在 release checkout 执行 `pnpm release:gate`。
2. 使用 secret manager 注入发布配置，再执行 `pnpm production:gate` 与 `pnpm production:worker:gate`。告警不作为应用配置门槛；后台异常由运行环境采集进程日志。支付默认关闭：无 checkout 时核心门禁只提示 `PAYMENT_CAPABILITY_DISABLED`；仅启用支付时才执行并要求通过 `pnpm payment:gate`（payment gate）。
3. 确认构建产物、数据库迁移版本和回滚版本均已记录；生产门禁失败时停止发布。
4. 确认本地可重复的模型网关和 provider refund acceptance 脚本存在；这些脚本只能作为契约/故障路径检查，不能替代真实外部证据。

## 2. 备份与迁移

1. 先以只读窗口和保留期策略执行 `pg_dump`，记录备份校验和与恢复目标。
2. 从 0008 升级前，在备份副本只读核对 `execution_operations.attempt_id` 和 `settlement_outbox.idempotency_key` 无重复；如有重复，停止迁移并人工核对，不自动合并或删除账务记录。
3. 运行 `pnpm db:migrate`，核对 migration table、账务唯一约束和应用 schema 版本。
4. 迁移失败时保留原 release，不启动 worker；恢复演练必须使用隔离数据库并记录行数/关键不变量。

## 3.1 Upload persistence / quota

1. 生产必须配置绝对路径 `UPLOAD_STORAGE_DIR`，目录归 `chatnest` 用户所有、权限 `0700`，且不位于 `public/` 或临时函数磁盘。
2. 按 `UPLOAD_USER_QUOTA_BYTES` 与 `UPLOAD_TOTAL_QUOTA_BYTES` 验证单用户/全局配额；写入前检查配额，清理后复核数据库 `upload_assets` 与磁盘占用一致。
3. 暂停上传、会话编辑／删除和过期清理并排空正在处理的请求；只关闭新上传开关并不冻结已有文件。以同一停写点备份数据库上传元数据和 `UPLOAD_STORAGE_DIR` 原文件，保留 owner-only 模式、归属和配对校验和，备份包存到挂载目录之外。
4. 先还原到隔离数据库和新私有卷，以应用运行身份复核文件模式、SHA-256、关联记录和原始字节；过宽的卷或文件权限先修复后再放量。用真实 HTTP／浏览器核对原所有者可下载、匿名及无权账号读不到，缺失或同大小篡改失败；从原 Admin 入口清理过期草稿，确认已发送文件保留。
5. 本地验收只证明 ChatNest 现有私有文件卷和 DB 配对恢复。目标镜像、实际挂载、可用容量、对象存储和正式环境读写仍需各自验收。

## 3. Worker 安装与启动

```sh
sudo install -m 0644 deploy/settlement-worker.service /etc/systemd/system/
sudo install -m 0644 deploy/settlement-worker.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now settlement-worker.timer
```

worker 以 `chatnest` 用户运行，启动前由 `production-gate.mjs --production --worker` 阻断缺失配置和 loopback endpoint 的发布。

## 4. 健康与证据

1. 先检查 timer/service 状态，再调用带 control token 的 billing health endpoint。
2. 运行 connected acceptance，保存 operation、ledger、reconcile、dead-letter 和审计导出证据。
3. 触发一次可恢复失败，确认重试、结构化日志、退出码和恢复；失败不等同于成功验收。

## 5. Log rotation / retention

1. 为 journald/service 日志配置保留期、大小上限和访问审计，确认 worker 失败不会无限增长磁盘。
2. 验证日志中只有 deployment、kind、reason code 和计数等脱敏字段；控制 token、service token、签名和 provider 原文不得出现。

## 6. 回滚

1. 停止 timer，保留失败服务日志与数据库备份。
2. 切回上一个已验收 release；不得用手工删除账务行修复迁移。
3. 仅在 schema 向后兼容且值班确认后执行必要的 migration rollback/forward-fix。
4. 再次执行 health、connected acceptance 并检查 worker 日志，记录 rollback 结果。

## 7. 未覆盖的外部证据

模型网关（model gateway）和真实支付 provider 退款/拒付回执（provider refund）仍需外部环境验收；支付 gate 只阻断充值/退款能力，不阻断核心模型、工具和账务运行；本清单只把发布步骤和阻断条件固定下来。

### Worker 日志

- 结算 worker 用标准输出和标准错误输出 JSON；重点关注 `WORKER_FAILED`、`BILLING_ATTENTION` 和退出码。运行环境按现有日志采集链路配置查询和通知，应用不发告警 webhook、不写告警历史表、不要求值班回执。
- ChatNest 迁移 `0018_drop_alert_delivery_events` 删除旧告警投递表及其中记录，不删除业务账务数据，已有 0017 不回写。在批准窗口先停止旧 worker、按现有流程备份，再应用 0018 并启动新版本；需要回滚到仍依赖旧表的版本时，先按备份恢复流程处理，不能直接切回旧 worker。
