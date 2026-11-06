# Porta / 1688 接入

## 当前演示范围

ChatNest 是 Next.js 全栈应用，Porta 是独立 HTTP MCP 服务。`server/infrastructure/mcp/agent.json` 启用 Exa 免 Key 搜索/网页读取，以及百炼的 `native_alibaba1688_product_find_product`；Tavily 为 `enabled:false`。Porta 端 `PORTA_PROVIDERS=none`，只启用 `alibaba1688_product` 的 `find_product`。不连接旧供应商，也不使用其他项目后端。

ChatNest 的私密环境引用：

```dotenv
PORTA_MCP_URL=https://your-porta-host/mcp
PORTA_SERVICE_TOKEN=<私密服务令牌>
```

供应商 Key 仅在 Porta 服务端配置。ChatNest 服务令牌不是百炼 Key；凭据不传入模型、浏览器或 Git。

本地开发使用 `NODE_ENV=development`、`AGENT_MCP_ALLOW_LOOPBACK_HTTP=1` 与 `PORTA_MCP_URL=http://127.0.0.1:3334/mcp`。生产仍要求 HTTPS。URL 必须是完整地址或完整环境引用，禁止带凭据、片段、重定向或插值拼接来绕过端点检查。

## Ask、Todo 与执行权限

- Ask 只收集缺少的任务信息：缺少影响结果的必要输入时先问；已有明确关键词和数量的单次查询不再问一遍。
- Todo 只用于真实多步骤任务，保存完整快照，稳定 ID、一个进行中项；不把技能加载、计划查询或未取得的资料标为完成。
- MCP 只暴露 allowlist 内的实时工具。`autoApproveTools` 决定文件配置工具是否自动批准；管理连接保留其现有审批策略。技能与 Ask 均不授予执行权限。
- 已允许的只读查询使用现有自动批准配置，不逐次弹确认；当前1688调用仍暂停。历史待审批会话不自动授权或重放。主卡展示关键词与返回条数，原始名称、参数、返回和错误进详情。元数据加载时不闪现原参数；未知操作最终仍可识别、可查看详情。
- 查询、空结果和超时均可能收费。不自动重试、翻页或逐条补查；没有执行证据就不宣称查询成功。

## 按需技能

应用仅内置 `similar-products`（找相似商品），用于相似商品召回、看图比较与差异判断，按需加载。简单商品查询直接使用 MCP 工具；Ask/Todo 由核心工具负责，不在技能里重复。旧调查、1688 和通用 Porta 手册三份技能均删除，不保留别名。Codex 宿主及独立 Porta CLI skill 保持独立。

## 错误与证据

MCP 的 `isError` 保持失败状态，错误正文由现有 Porta 适配脱敏后留在详情。成功返回和空结果保留原字段、类型及来源关联；不把供应商数据归一成另一套接口。表格与文档复用现有产物和 evidence ledger，不伪造商品或来源。

## 本轮验证边界

离线回归验证 schema、服务开关、只暴露一个工具、审批去重/只读门控、Ask 保存续跑、Todo 投影及界面详情。服务端测试使用 `tsx --conditions=react-server --test`，客户端测试使用既有隔离进程。

历史审批仅检查重开与详情，不批准商品查询。通用 Ask/Todo 已通过本机真实 DeepSeek Flash 续跑与重开验证；Exa 已真实查询。1688仍未真实调用。最新模型与供应商验收状态只记在[唯一研发 TODO](../superpowers/plans/2026-11-04-core-launch-goal-and-todo.md)；离线测试不冒充真实调用成功。
