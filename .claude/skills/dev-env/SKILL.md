---
name: dev-env
description: 拉起或收尾 ChatNest 开发基座(依赖体检与安装指引、Docker PG、数据库迁移、启动/停止 dev 服务)。当用户要启动/停止项目、起开发环境、局域网访问、或新机器初始化时使用。
---

# dev-env 开发基座

**最快路径(优先)**:`pnpm dev:up` —— 闭环脚本 `.claude/skills/dev-env/scripts/dev-env-loop.mjs` 会自动完成下面第 1-6 步;成功后直接做第 7 步验证。
**脚本失败或环境特殊时**:按下面的步骤逐条手动执行(每步都有命令、预期结果、失败处理,照抄即可)。

---

## 闭环步骤(共 8 步)

### 第 0 步:环境形态识别(动手前必做)

```bash
uname -o                    # MING64/CYGWIN=Windows 侧 Git Bash;Linux=WSL/Linux
docker context show         # desktop-windows / desktop-linux / default
wsl -l -v                   # 仅 Windows:看 WSL 发行版(无 WSL 会报错,属正常)
which docker node pnpm      # 三个 CLI 必须在同一路径环境
```

| 形态 | 特征 | 策略 |
| --- | --- | --- |
| A. Windows + Docker Desktop(WSL 集成) | Git Bash 里 docker/node/pnpm 都有 | 直接 `pnpm dev:up` |
| B. docker 只在 WSL 内 | Windows 侧无 docker,WSL 里有 | `wsl` 进入后 `cd /mnt/d/<仓库路径> && pnpm dev:up`,全流程在 WSL 内 |
| C. 纯 WSL/Linux/macOS | uname = Linux/Darwin | 直接 `pnpm dev:up`(Linux 分支自适配) |

**铁律:docker、node、pnpm、dev 服务四者必须同侧,不跨侧拼命令。**
坑:compose 端口绑的是 `127.0.0.1:55432`,容器与 dev 不同侧时回环不通——同侧跑即可;确需跨侧,把 `deploy/docker-compose.dev.yml` 端口改成 `"55432:5432"` 并在 `.env.local` 用宿主机 IP。

### 第 1 步:体检 Node

```bash
node -v
```
预期:>= 22.13(如 v22.22.3)。低于则指引升级(Windows:`winget install OpenJS.NodeJS.LTS`;macOS:`brew install node@22`;Linux:NodeSource)后终止。

### 第 2 步:体检 Docker 与 compose

```bash
docker --version          # 预期:输出版本号
docker compose version    # 预期:Docker Compose version v2+
docker info               # 预期:退出码 0(守护进程在跑)
```
- `docker` 不存在:尝试自动装——Windows:`winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements`;macOS:`brew install --cask docker`;Linux:`curl -fsSL https://get.docker.com | sh`。装完通常要开一次 Docker Desktop(Windows 部分机器需注销重登)。
- `docker info` 失败(守护进程没跑):Windows:`cmd /c start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"`;macOS:`open -a Docker`;Linux:`sudo systemctl start docker`;然后每 2 秒重试 `docker info`,至多 90 秒,仍不行让用户手动开。
- 90 秒还不行:把手工安装链接指给用户,终止。

### 第 3 步:环境文件 .env.local

```bash
ls .env.local && grep -c '^POSTGRES_URL=' .env.local
```
预期:文件存在且 POSTGRES_URL 非空。缺失则:复制 `deploy/.env.example` 为 `.env.local`,把 `AUTH_SECRET` 换成随机值(`openssl rand -base64 32`)、`POSTGRES_URL` 设为 `postgres://chatnest:chatnest@127.0.0.1:55432/chatnest`,并提醒用户:模型三件套(OPENAI_API_KEY/BASE_URL/MODEL)不填则聊天不可用(页面能开)。

### 第 4 步:依赖与开发库

```bash
ls node_modules >/dev/null || pnpm install --frozen-lockfile   # 新机器才需要
docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' chatnest-postgres
```
- inspect 输出**空**=存在遗留容器(非 compose 管理):先 `docker rm -f chatnest-postgres`(数据在卷里,不受影响)。
- inspect 报错"没有那个容器"=干净机器,直接下一步。

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```
预期:`Container chatnest-postgres Started`。然后等健康:

```bash
until [ "$(docker inspect -f '{{.State.Health.Status}}' chatnest-postgres)" = "healthy" ]; do sleep 2; done
```
预期:几秒内返回。数据卷 `chatnest-postgres-data` 持久化,以后删容器不丢数据。

### 第 5 步:数据库迁移

```bash
pnpm db:migrate
```
预期:输出 `Migrations completed`(幂等,重复执行无害)。失败:检查 `.env.local` 的 POSTGRES_URL、看 `docker logs chatnest-postgres`。

### 第 6 步:启动 dev(绑定全部网卡)

优先用进程工具(自动列网卡 + 绑 0.0.0.0 + 优雅停止):

```bash
pnpm dev:start
```
等价手动命令:`corepack pnpm dev --hostname 0.0.0.0 --port 3003`。
启动横幅会列出每个网卡的访问地址(含局域网 IP);**保持该进程前台运行,不要 Ctrl+C**(除非用户要停)。

### 第 7 步:验证就绪

```bash
curl -s http://127.0.0.1:3003/ping        # 预期:pong
curl -s http://<横幅里的局域网IP>:3003/ping  # 预期:pong(局域网可用)
```
探活等待(还没起来时):

```bash
until curl -s -m 2 http://127.0.0.1:3003/ping | grep -q pong; do sleep 2; done
```
超过 120 秒仍不通:看 dev 输出找报错(常见:3003 被占 → 先 `pnpm dev:stop` 再重跑)。

### 第 8 步:向用户汇报

一句话报:访问地址列表(横幅里的全部 URL)+ 数据库状态 + 模型是否已配置(没配就说明聊天不可用、页面可开)。

---

## 收尾

```bash
pnpm dev:down          # 杀 dev + 停库(数据保留)——优先
pnpm dev:stop          # 只杀 dev(库继续跑)
docker compose -f deploy/docker-compose.dev.yml stop   # 只停库
pnpm dev:down --purge  # 彻底清库(删数据卷,不可恢复,执行前必须先问用户)
```

## 故障速查

| 症状 | 处理 |
| --- | --- |
| `dev:up` 在 Windows 秒败无输出 | 已知的 corepack .cmd 垫片问题已在脚本修复;若复现,手动 `corepack pnpm dev --hostname 0.0.0.0 --port 3003` |
| 3003 被占用 | `pnpm dev:stop` 清残留进程树后重试 |
| 数据库 60 秒不健康 | `docker logs chatnest-postgres`;卷损坏极端情况才 `--purge` 重建(先问用户) |
| 局域网访问不通 | 防火墙放行 3003;确认 dev 绑的是 0.0.0.0(横幅会写明) |
| WSL 里访问不到 Windows 侧库 | 回看第 0 步铁律:同侧跑 |
