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
