# docs 索引

> 本文件是 `docs/` 的入口索引。当前为人工维护;**规划中**:由脚本(scripts/docs-index.mjs)扫描 docs/ 自动生成/校对清单,取代人工盘点(设计待做,见仓库待办)。
> 最高纪律与项目约定见根目录 [AGENTS.md](../AGENTS.md) 的"工程纪律约束"节,优先级高于本目录任何文档。

## 新会话上手顺序

1. [AGENTS.md](../AGENTS.md) - 工程纪律约束(最高要求)
2. [CODEBASE_MAP.md](CODEBASE_MAP.md) - 模块现状权威地图
3. [DEVELOPMENT.md](DEVELOPMENT.md) - 架构、启动、验证命令与功能边界
4. [task.md](task.md) / [lesson.md](lesson.md) - 最近在做什么 / 别再犯什么

## 按主题

### 工程与规范

| 文档 | 内容 |
| --- | --- |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | 模块地图:改结构必看、必更 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 开发者手册:启动、验证、边界、上游策略 |
| [ci-offline-checks.md](ci-offline-checks.md) | CI 无网隔离设计与边界声明 |

### 任务与教训

| 文档 | 内容 |
| --- | --- |
| [task.md](task.md) | 逐轮任务台账(含验收数字) |
| [lesson.md](lesson.md) | 验收教训:测试通过不等于用户认可 |

### 集成细节(integrations/,7 份)

| 文档 | 内容 |
| --- | --- |
| [integrations/mcp-settings.md](integrations/mcp-settings.md) | 可视化 HTTP MCP 管理(加密/CAS/SSRF 防护) |
| [integrations/porta.md](integrations/porta.md) | Porta 接入与 TDD 记录 |
| [integrations/porta-hosts.md](integrations/porta-hosts.md) | Porta 宿主配置 |
| [integrations/porta-host-verification.md](integrations/porta-host-verification.md) | Porta 宿主验收 |
| [integrations/model-settings.md](integrations/model-settings.md) | 后台模型配置(PR #4) |
| [integrations/private-uploads.md](integrations/private-uploads.md) | 私有附件与文档解析(最详尽的部署文档) |
| [integrations/result-tables.md](integrations/result-tables.md) | MCP 结果表 |
| [integrations/live-acceptance.md](integrations/live-acceptance.md) | 真实联调现状与验收边界(持续更新) |

### 设计与验收档案(superpowers/)

- `specs/` - 10 份设计定稿,文件名即日期与主题
- `plans/` - 32 份逐轮实施计划与验收记录,文件名即日期与主题
- 每轮固定节拍:spec -> plan -> 独立审查 -> 真实验证 -> verification 文档

### 历史快照(冻结,不再更新)

| 文档 | 内容 |
| --- | --- |
| [20261019164231_chatnest技术栈基座梳理.md](20261019164231_chatnest技术栈基座梳理.md) | 2026-10-19 基座盘点(部分数据已过时,以 CODEBASE_MAP 为准) |
| [20261019164232_chatnest轻量DDD改造规划.md](20261019164232_chatnest轻量DDD改造规划.md) | 2026-10-19 DDD 规划(P0 已执行,后续阶段待启动) |

## 维护规则

- 新增文档:更新本索引对应表格;持久化快照类文档用 `YYYYMMDDHHMMSS_标题` 命名,活文档(CODEBASE_MAP/task/lesson 等)保持原名。
- 本索引与实际不符即为缺陷:要么改索引,要么补文档。
