# agent 域模块(Agent 运行时)

垂直域模块,不按三层拆分(P5 拍板):runtime 做 MCP 连接与工具发现(基础设施属性),
approvals/result-evidence 是领域规则,mcp-settings 自带仓储。

## 职责

- `runtime.ts` / `config.ts`:每任务配置快照、HTTP MCP 客户端、工具清单发现
- `approvals.ts` / `result-evidence.ts` / `run-failure.ts`:审批门、证据账本、失败上报(安全边界核心)
- `message-turn.ts`:编辑/重生成的会话轮次纯函数
- `browser-session.ts` / `browser-tools.ts` / `browser-policy.ts`:共享浏览器工具与出站策略
- `mcp-settings/`:可视化 MCP 管理(自有 repository/API 分层,不动)
- `skills/`:技能发现;`porta-error.ts`:Porta 错误品牌化

## 依赖约定

- 可依赖:domain/**、shared/**、ai/**(单向 ai<-agent)
- 禁止依赖:@/app/**、next/*(biome R2)
- 被依赖方:application/chat(send-message 经 createAgentRuntime 编排)

## 变更注意

- 审批门与证据账本是安全边界:任何"绕过审批/伪造证据"的改动直接拒绝
