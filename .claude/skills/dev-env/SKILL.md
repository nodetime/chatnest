---
name: dev-env
description: 一键拉起或收尾 ChatNest 开发基座(依赖体检、Docker PG、迁移、绑定全部网卡启动 dev)。当用户要启动/停止项目、起开发环境、局域网访问、或新机器初始化时使用。
---

# dev-env 开发基座

真实引擎是 `scripts/governance/dev-env.mjs`(工具中立,Codex/CI 同样直接调 pnpm 脚本);本 skill 是 Claude 侧入口。

## 用法

```bash
pnpm dev:up            # 一键:体检 -> PG(compose) -> 迁移 -> dev 绑 0.0.0.0:3003
pnpm dev:down          # 优雅收尾:停 dev + 停容器,数据保留
pnpm dev:down --purge  # 彻底清库(删数据卷,不可恢复,先与用户确认)
```

## up 内部流程(失败会自带指引)

1. 体检:Node >= 22.13、docker CLI、docker compose;缺失自动 winget 安装,失败打印各平台手工指引
2. `.env.local` 缺失则从 deploy/.env.example 生成(AUTH_SECRET 随机、POSTGRES_URL 指向本地库),并提示填模型三件套
3. docker compose(deploy/docker-compose.dev.yml)拉起 PostgreSQL:127.0.0.1:55432,数据卷 `chatnest-postgres-data`(命名卷,删容器不丢数据);发现非 compose 的遗留同名容器会先接管(仅删壳,数据在卷里)
4. `pnpm db:migrate`(幂等)
5. 启动横幅列出全部网卡与可访问 URL(0.0.0.0 绑定,局域网可访问)
6. /ping 探活;Ctrl/Cmd+C 优雅停止(dev 先停,库默认保留)

## 故障排查

- winget 装不上 Docker:让用户手工装 Docker Desktop(https://www.docker.com/products/docker-desktop/),装完启动再 up
- Docker CLI 在但守护进程没起:脚本会自动拉起 Docker Desktop 并等 90 秒;仍失败让用户手动开
- 端口 3003 被占:down 会清残留监听进程;up 前也可单独 `pnpm dev:down`
- 数据在哪:命名卷 `chatnest-postgres-data`(`docker volume inspect` 看位置);彻底重置用 `pnpm dev:down --purge`
- 数据库仅绑 127.0.0.1,不对局域网暴露;局域网访问走 dev 服务的 3003 端口
