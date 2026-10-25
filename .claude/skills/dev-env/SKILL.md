---
name: dev-env
description: 拉起或收尾 ChatNest 开发基座(依赖体检与安装指引、Docker PG、数据库迁移、启动/停止 dev 服务)。当用户要启动/停止项目、起开发环境、局域网访问、或新机器初始化时使用。
---

# dev-env 开发基座

闭环由脚本承担,直接执行即可(Windows/macOS/Linux 自适配):

```bash
pnpm dev:up            # 体检(缺 Docker 自动装或给指引)-> .env.local -> PG(compose)-> 迁移 -> 绑 0.0.0.0:3003 启动
pnpm dev:down          # 收尾:杀 dev + 停库,数据保留
pnpm dev:down --purge  # 彻底清库(删数据卷,不可恢复,执行前先与用户确认)
```

脚本分工:`.claude/skills/dev-env/scripts/dev-env-loop.mjs` 是本 skill 自带的闭环支撑脚本(编排);`scripts/governance/dev-env.mjs` 是纯进程工具(列网卡/绑定启动/优雅杀死,`pnpm dev:nics|start|stop` 单独可用)。失败时脚本会打印各平台指引,按提示处理后重试;数据库仅绑 127.0.0.1,局域网访问走 3003 端口。

## 环境形态识别与策略(AI 先做这一步)

动手前先探明机器形态,再决定闭环在哪一侧跑。探查命令:

```bash
uname -o                    # MING64/CYGWIN=Git Bash(Windows 侧); Linux=WSL/Linux 原生
docker context show         # desktop-windows / default / desktop-linux
wsl -l -v                   # 仅 Windows 侧:看 WSL 发行版与 Docker 集成
which docker node pnpm      # 看 CLI 落在哪侧
```

| 形态 | 特征 | 策略 |
| --- | --- | --- |
| A. Windows 原生 + Docker Desktop(WSL 集成) | Git Bash 里 `docker` `node` `pnpm` 都在 | 直接 `pnpm dev:up`(仓库基准形态,当前主开发机即此) |
| B. docker 只在 WSL 内 | Windows 侧 `docker` 不存在,WSL 里有 | **整个闭环在 WSL 内跑**:`wsl` 进入后 `cd /mnt/d/<仓库路径> && pnpm dev:up`。不要 Windows 侧 pnpm + WSL 侧 docker 拼半套——闭环脚本假设同一环境内 docker/next 同在 |
| C. 纯 WSL / Linux / macOS 开发 | `uname` = Linux/Darwin | 同一命令,Linux 分支自适配 |

关键坑(形态 B/C 混布时必须想到):

- **compose 端口绑的是 `127.0.0.1:55432`**:容器在 Windows 侧跑而 dev 在 WSL 里跑时,WSL 的 127.0.0.1 访问不到 Windows 的回环(默认 NAT 网络)。解法:容器与 dev 同侧跑;确需跨侧,改 `deploy/docker-compose.dev.yml` 端口为 `"55432:5432"`(全接口,仅可信内网)并在 `.env.local` 用宿主机 IP
- **路径风格**:WSL 内操作仓库走 `/mnt/d/...`;drizzle 迁移产物、`outputFileTracingIncludes` 都是仓库相对路径,同侧跑即可无视
- **Docker Desktop 的 WSL 集成开关**:Docker Desktop -> Settings -> Resources -> WSL Integration,启用对应发行版后形态 B 升级为形态 A
- **dev 服务绑定 0.0.0.0**:任何形态下,局域网访问都是打宿主机的 3003;WSL2 的 localhost 转发对 Windows -> WSL 方向有效,反向(局域网直访 WSL 内 dev)需要 `netsh portproxy` 或镜像网络,遇到再指引,不预配

判断原则一句话:**docker、node、pnpm、dev 服务四者必须在同一侧,闭环就在那一侧跑;不跨侧拼命令**。
