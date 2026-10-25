---
name: dev-env
description: 拉起或收尾 ChatNest 开发基座的自闭环流程(依赖体检与安装指引、Docker PG、数据库迁移、启动/停止 dev 服务)。当用户要启动/停止项目、起开发环境、局域网访问、或新机器初始化时使用。
---

# dev-env 开发基座(自闭环)

职责分工:**本 skill 是编排大脑**,按步骤驱动各工具;`scripts/governance/dev-env.mjs` 只是纯进程工具(查网卡/绑全网卡启动/优雅杀死,经 `pnpm dev:nics|start|stop` 调用)。数据库用 `deploy/docker-compose.dev.yml`(数据在命名卷 `chatnest-postgres-data`,删容器不丢数据)。

## 拉起闭环(按序执行,每步失败走对应指引)

1. **依赖体检(按用户系统分支,先探 `process.platform` / `uname`)**
   - Node >= 22.13(`node -v`);低了指引升级(Windows: `winget install OpenJS.NodeJS.LTS`;macOS: `brew install node@22` 或官网 pkg;Linux: NodeSource),官网 https://nodejs.org/
   - Docker CLI(`docker --version`)与 compose(`docker compose version`);缺失自动安装:
     - Windows:`winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements`
     - macOS:`brew install --cask docker`(或官网 dmg:https://www.docker.com/products/docker-desktop/;Linux 服务器可改用 OrbStack/colima,由用户选择)
     - Linux:`curl -fsSL https://get.docker.com | sh`(compose 插件随脚本装入)
     - 安装失败则停下,把上述手工路径指给用户;装完 Docker Desktop 需启动一次(部分 Windows 机器需注销重登)
   - 守护进程未运行(`docker info` 失败)时拉起并轮询(至多 90 秒):
     - Windows:`cmd /c start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"`
     - macOS:`open -a Docker`
     - Linux:systemd 一般自启,`sudo systemctl start docker`
     - 仍失败让用户手动打开对应应用
2. **环境文件**:`.env.local` 不存在时,复制 `deploy/.env.example` 生成,将 `AUTH_SECRET` 设为随机值(如 `openssl rand -base64 32`)、`POSTGRES_URL` 设为 `postgres://chatnest:chatnest@127.0.0.1:55432/chatnest`,并提醒用户补模型三件套(OPENAI_API_KEY/BASE_URL/MODEL,不补则聊天不可用)
3. **开发库**:`docker compose -f deploy/docker-compose.dev.yml up -d`(首次新机器先 `pnpm install --frozen-lockfile`);若存在非 compose 管理的遗留容器 chatnest-postgres(`docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' chatnest-postgres` 为空),先 `docker rm -f chatnest-postgres`(数据在卷里不受影响)再 compose up;轮询 `docker inspect -f '{{.State.Health.Status}}' chatnest-postgres` 至 healthy
4. **迁移**:`pnpm db:migrate`(幂等)
5. **启动**:`pnpm dev:start`(内部自动列出全部网卡访问地址并绑定 0.0.0.0:3003);确认 `/ping` 返回 pong

## 收尾

```bash
pnpm dev:stop                                    # 杀 dev 进程(端口 3003 进程树)
docker compose -f deploy/docker-compose.dev.yml stop   # 停库,数据保留
docker compose -f deploy/docker-compose.dev.yml down -v && docker volume rm chatnest-postgres-data  # 彻底清库(删卷,先向用户确认)
```

## 边界

- 数据库仅绑 127.0.0.1:55432,不对局域网暴露;局域网访问走 dev 服务 3003 端口
- 本 skill 不改业务代码;异常先看 `docker logs chatnest-postgres` 与 dev 输出
