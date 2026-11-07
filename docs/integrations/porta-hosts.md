# Porta：Codex 与 ChatNest 接入

两端共用 Porta HTTP MCP，不重新实现供应商 API。Codex 的通用工具指南与 ChatNest 的业务 SOP 各司其职，不预设每个请求都跑同一条流程。

| 主机 | 执行方式 | skill 位置 | 授权边界 |
| --- | --- | --- | --- |
| Codex | 已安装 `porta` CLI；也可使用已配置的 MCP | 项目 `.agents/skills/porta` 或用户 `~/.agents/skills/porta` | 遵守 Codex 的执行权限；不继承 ChatNest 的审批 |
| ChatNest | 现有 HTTP MCP runtime，实时发现 allowlist 内的工具 | `server/infrastructure/skills/similar-products/` 唯一按需相似商品方法 | 已允许只读工具自动执行，其他工具遵守宿主策略；skill 不执行 shell、不授予凭据 |

## Codex

从独立 `porta-cli` 仓库构建、打包或安装已发布版本，见 [Porta CLI 说明](https://github.com/nodetime/porta-cli#readme)。不要安装无关的 npm 同名包。

```sh
porta skills export --output .agents/skills
# 用环境或私密 secret manager 提供 PORTA_MCP_URL、PORTA_SERVICE_TOKEN。
porta doctor
porta tools list
porta tools inspect <从列表发现的工具名>
porta tools call <工具名> --input @request.json
```

`request.json` 使用实际 schema 的原始参数和类型。CLI 不读取服务端 `.env`；需要由启动终端/运行器显式提供环境变量。服务 token 不是供应商 key，供应商密钥仅在 Porta 服务端。

本地 loopback HTTP 必须显式添加 `--allow-local-http`；远程服务使用 HTTPS。`~/.config/porta/config.json` 可保存命名 profile，但只写地址和 `tokenEnv` 变量名，不写 token。skill 导出不会覆盖现有目录；升级先对比新版本，不自动删除或覆盖已有修改。

## ChatNest

默认 `server/infrastructure/mcp/agent.json` 启用免费 Exa search/fetch 和百炼单个 `native_alibaba1688_product_find_product`；Tavily 关闭。配置 Porta 的环境引用：

```dotenv
PORTA_MCP_URL=https://your-porta-host/mcp
PORTA_SERVICE_TOKEN=<由管理员私密提供>
```

- 使用既有模型配置：`MODEL_PROVIDER=openai`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_KEY`。BASE_URL 是 API 基础路径，不能带 `/chat/completions` 后缀。
- 本地测试 HTTP 还需 `AGENT_MCP_ALLOW_LOOPBACK_HTTP=1` 且 `NODE_ENV=development`；生产仍要求 HTTPS。
- 若启用了后台 MCP 配置，还需 `MCP_SETTINGS_ENCRYPTION_KEY` 和精确 `MCP_ALLOWED_ORIGINS`；无效的后台配置会使 runtime 读取失败，即使没有管理型连接。不要通过关闭校验解决。
- 文件型连接与后台连接不能重复 ID。重启服务加载环境；新任务重新获取工具和 skill。
- `/api/agent` 的 configured/技能目录仅证明配置可读取，不证明模型、供应商或完整任务成功。
- 真实模型验收必须移除 `PLAYWRIGHT`、`PLAYWRIGHT_TEST_BASE_URL`、`CI_PLAYWRIGHT`，不是设成 `0`；这些非空值会启用测试模型。

## 业务 SOP

ChatNest 仅内置 `similar-products`（找相似商品），按需加载；搜索、网页读取及1688直接使用 MCP，不复制工具手册。旧三份应用技能及快照锁已删除；Codex 宿主和独立 Porta CLI skill 不变。

Ask 收集影响下一步的目标、材料或选择，不代替 MCP 审批。Todo 跟踪实质性多步骤任务，只有实际取得证据才完成对应步骤。普通明确商品查询不强行进入调查流程；缺少调查对象或原始材料时先对齐。

工具参数以实时发现的 schema 为准；当前未接入的网页、公司或店铺能力不伪装为可用。自动批准取自现有 `autoApproveTools`，不由 skill 或模型自授权限。当前已允许只读查询自动执行，但收费调用按用户要求暂停。

## 完整任务的验收标准

1. 上传合成材料，从正常聊天入口提交任务，不注入模型工具响应、不为模型排工具顺序。
2. 记录模型实际选择的 skill、工具和原生参数。按实际宿主策略执行：允许的只读查询自动执行；需要审批的操作在确认前不执行。
3. Agent 自行决定是否补查、如何生成通用产物；表格须引用实际 MCP evidence。
4. 检查产物落库，离开并重新打开聊天与产物，确认内容、来源及版本一致。
5. 真实模型、真实 Porta、模拟供应商分别标注。模型失败时保留失败标记和已有资料；恢复只发送普通用户请求，不直接重放工具。

本机执行结果见 [联调记录](porta-host-verification.md)。
