# Porta：Codex 与 ChatNest 接入

两端共用 Porta HTTP MCP 和同一份 skill，不重新实现供应商 API，不预设工具调用顺序。

| 主机 | 执行方式 | skill 位置 | 授权边界 |
| --- | --- | --- | --- |
| Codex | 已安装 `porta` CLI；也可使用已配置的 MCP | 项目 `.agents/skills/porta` 或用户 `~/.agents/skills/porta` | 遵守 Codex 的执行权限；不继承 ChatNest 的审批 |
| ChatNest | 现有 HTTP MCP runtime，实时发现 allowlist 内的工具 | 仓库 `server/infrastructure/skills/porta`，已经随本次提交安装 | 保留每次调用审批；skill 不执行 shell、不授予凭据 |

## Codex

从 Porta 仓库构建、打包后安装本地 archive，见 [Porta CLI 说明](https://github.com/nodetime/porta/blob/main/apps/cli/README.md)。不要安装无关的 npm 同名包。

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

默认 `server/infrastructure/mcp/agent.json` 已配置 Porta 的环境引用及六个原生工具 allowlist。仅需本地私密环境：

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

## skill 来源与升级

`server/infrastructure/skills/porta` 是 Porta 发布源的原样快照，不是独立维护的一套指令。`server/infrastructure/skills/porta-skill.lock.json` 记录仓库、提交、版本和三个文件的 SHA-256。CI 验证字节完整性、实际 loader 与资源读取。

更新步骤：将新版本用 CLI 导出到临时目录，对比并审查三份文件，替换快照并更新 lock；运行 `server/infrastructure/skills/porta-skill.test.ts` 与完整检查。不要向公共 skill、lock 或文档写部署地址、凭据和客户数据。

## 完整任务的验收标准

1. 上传合成材料，从正常聊天入口提交任务，不注入模型工具响应、不为模型排工具顺序。
2. 记录模型实际选择的 skill、工具和原生参数。审批前无供应商执行；实际 UI 同意后执行。
3. Agent 自行决定是否补查、如何生成通用产物；表格须引用实际 MCP evidence。
4. 检查产物落库，离开并重新打开聊天与产物，确认内容、来源及版本一致。
5. 真实模型、真实 Porta、模拟供应商分别标注。模型失败时保留失败标记和已有资料；恢复只发送普通用户请求，不直接重放工具。

本机执行结果见 [联调记录](porta-host-verification.md)。
