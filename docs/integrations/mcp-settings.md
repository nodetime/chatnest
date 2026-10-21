# 可视化 HTTP MCP 管理

ChatNest 的“设置 → 工具连接”支持新增 HTTP MCP、JSON 导入、initialize / tools/list 测试、选择开放工具、编辑、启停与删除。**一个部署就是一个共享工作区**；此版本没有组织、成员角色或分租户隔离。Porta 仍是独立服务，其部署、套餐与凭据不由本页面开通。

## 部署配置

1. 先备份数据库，在可信部署终端运行项目迁移：`corepack pnpm db:migrate`。新增 `0001_mcp_settings.sql`（含迁移 journal）创建单行 `McpSettings` 表。正常 `pnpm build` 也会先运行迁移；验证/构建时务必明确数据库目标，不要把生产库当测试库。
2. 使用一个**常规注册账号**。通过可信数据库控制台确认其不可变 UUID，例如以绑定参数查询 `SELECT id, email, "isAnonymous" FROM "User" WHERE email = $1;`，并人工核对实际账号；不要把邮箱、显示名称或游客 ID 当管理员标识。
3. 在部署 secret manager / 私密环境文件中设置以下变量，然后重启部署。不要在聊天、代码库、日志或截图里粘贴真实值。

```dotenv
MCP_ADMIN_USER_IDS=ADMIN_UUID
MCP_SETTINGS_ENCRYPTION_KEY=BASE64_32_RANDOM_BYTES
MCP_ALLOWED_ORIGINS=https://mcp.example.org,https://porta.example.org
```

- `MCP_ADMIN_USER_IDS`：逗号分隔的精确小写 UUID；必须同时拥有 `regular` 会话。不存在首个用户自动提权、邮箱匹配或游客例外。
- 加密密钥在可信终端用 `openssl rand -base64 32` 生成。严格标准 Base64、解码后恰好 32 字节；不附带空格/换行。没有默认密钥。
- 允许来源必须是**精确 origin**（协议、主机、非默认端口），不含路径、query、fragment 或末尾 `/`，不接受通配符；只能由部署操作者修改。
- 管理 GET 只对管理员开放；所有测试和写入 POST 还需要与浏览器目标一致的 `Origin`。反向代理需正确保留目标协议/主机，不要禁用来源检查。
- 两个管理环境变量（密钥、允许来源）都为空时，不读取 managed 数据，保留原有文件行为并展示设置提示。只配置一项、密钥格式错误、数据库不可读或解密失败时操作失败，不静默回退旧缓存。

本地 fixture HTTP 仅在 `NODE_ENV=development` 或 `test` 且显式 `AGENT_MCP_ALLOW_LOOPBACK_HTTP=1` 时开放给 `localhost`、`127.0.0.1`、`[::1]`；该精确 origin 仍须列入允许来源。生产始终要求 HTTPS。

## 连接与导入

默认表单填写连接名、完整 HTTPS MCP endpoint 和认证方式（无需认证、Bearer 密钥或自定义请求头）。内部 ID 自动生成并可在“高级配置”编辑，JSON 导入和自定义请求头也在高级配置中。单个 Authorization Bearer 导入会使用密码输入，多请求头保持为完整自定义配置，不会丢弃官方字段。自定义请求头 JSON，例如 `{"Authorization":"Bearer TOKEN"}`。内部 ID 使用小写字母开头、数字/下划线，最长 31 字符。标识与文件服务不可冲突，文件 + managed（含停用）最多 8 项。

支持**恰好一个** HTTP 连接的严格 JSON：

```json
{
  "mcpServers": {
    "my-service": {
      "url": "https://mcp.example.org/mcp",
      "headers": { "Authorization": "Bearer TOKEN" }
    }
  }
}
```

外部 key 作为显示名称；新增时如果导入标识已存在，表单阻止保存并要求编辑原连接或在高级配置中更换标识，不会静默替换旧凭据。不合法的内部 ID 会生成 `mcp_` 开头的小写下划线 ID，在表单中明确展示并允许编辑。超过 32 KiB、多连接、`command`、`args`、其他额外字段或模糊形状都拒绝，不会静默挑选或执行。导入仅填表，之后仍须测试、勾选工具并保存。不支持 stdio、子进程或环境变量替换。

测试仅做初始化与列工具，**不会执行 tools/call**。成功只证明当时能完成这些协议操作，不证明付费套餐、额度、业务查询或所有权限可用。保存时服务端再次发现工具并核对选择；浏览器返回的工具列表不是授权凭据。所有 managed 工具每次调用都需确认，无客户端自动审批字段。远端原名（支持点号、最长 128 字符）与动态 input schema 保持原样；模型使用稳定、合法、最长 64 字符的独立 alias，既有合法 alias 保留。

## 密钥、编辑与并发

- 初次输入的 URL/密钥会暂存在管理员当前表单内存并通过 HTTPS 提交；不写 localStorage，不进入聊天或日志。成功保存/取消/卸载表单后清除该输入。
- GET 只返回显示名、启停、已开放工具、origin 和请求头名称；不返回任何请求头值，也不回显可能含 token 的完整 URL/path/query。
- 编辑默认 `keep`：服务端保留整个 opaque 连接，浏览器不取回秘密。勾选“更换地址或凭据”必须重新输入 URL 及**全部**请求头。换地址不会自动转发旧密钥；空白或 `{}` 表示清空全部旧请求头，不是合并。
- 整个 managed 列表（包含名称、URL、请求头）以 AES-256-GCM 加密保存；每次写入随机 nonce，认证数据绑定版本/工作区上下文/revision。数据库明文仅包含固定 singleton ID、revision、操作者 UUID 与时间。
- 所有保存/启停/删除都用 revision CAS。并发更新返回 409；UI 刷新版本，保留当前输入并要求重试/重新测试，避免覆盖其他管理员的更改。删除后旧任务可能仍持有其启动时快照；删除不是撤销远端 token，紧急撤销需在服务商端执行。

## 网络边界与限制

对 managed 连接，测试、保存重发现、每个 runtime fetch 都检查部署 origin；每个 fetch 还限定原 endpoint 的 origin + pathname（允许 SDK 会话 query），设置 `redirect: error`，不会把授权头带到跳转地址或另一路径。禁止 URL 用户信息、fragment、空白/反斜杠、环境引用；请求头拒绝 CRLF、重复大小写名称和 Host/Connection/Cookie/Content-Length/代理/协议等危险控制头。

请求配置最大 32 KiB；最多 16 个自定义请求头、单值 4096 字符；endpoint 最长 4096 字符。managed 每次网络请求有 10 秒上限、请求体及响应流各最多 1 MiB；目录最多 128 个工具（含 nextCursor 的分页目录明确拒绝，不静默截断）、description 最长 4096 字符、单工具 schema 序列化最多 64 KiB、总 schema + description 最多 256 KiB。初始化、列表、执行与关闭均有完整 Promise 的取消/超时竞速，避免 HTTP 202/断 SSE 导致 SDK RPC 长期挂起；取消时移除监听器，迟到的初始化结果也会关闭，关闭自身最多等待 1 秒。发现失败也关闭客户端；SDK 抛错和远端 isError 只给固定安全错误文案，不附带原异常 cause。

**允许来源是操作者信任的出站目的地，不等于任意 URL 代理。** 明确列入的私有 Porta origin 是允许的；本实现没有 DNS pinning，也不宣称做了 DNS 重绑定/公共 IP 过滤。操作者负责可信 DNS、TLS、出站防火墙/代理、云 metadata 与内网隔离、防止可信服务自身被接管。不要允许无法信任的 origin。服务 metadata/schema/output 也来自该受信任远端，并不是 ChatNest 的系统指令。

## 文件兼容与下一任务生效

`config/agent.json` / `AGENT_CONFIG_PATH` 服务始终只读；原有完整环境引用、Porta 缺失时跳过、Exa 的既有自动审批策略保持。新增出站策略只限制 managed，不追溯改变旧文件连接；部署操作者仍负责审查 legacy 配置。Porta 的原生业务错误保留其脱敏语义，managed 通用服务不回显业务异常细节。

每次创建新 Agent runtime 才读一次 file + managed 配置并捕获快照；停用的 managed 不合入。运行中的任务不会被后台修改；下一个新任务才读取新 revision。普通用户 `/api/agent` 只收到无密钥能力摘要，不收到管理 GET、URL 或 header 值。

## 备份与密钥轮换

加密数据库备份与密钥应分别安全备份，限制访问并演练恢复。**直接更换环境密钥会导致已有数据解密失败。** 轮换时停写/维护：保留旧 key，读取单行 revision，使用旧 key/原 revision 解密并验证列表，使用新 key、全新 nonce 和下一 revision 重加密，通过 CAS 写回并记录操作者/时间；随后协调切换所有实例的 key、重启并验证。完成可恢复备份后再撤销旧 key；不要记录解密列表或把 key 放入 shell history。此版本没有浏览器轮换入口。

## 验证与证据

离线专属测试（保留 `server-only` 防护）：

```sh
corepack pnpm exec tsx --conditions=react-server --test tests/unit/mcp-settings*.test.ts
corepack pnpm exec tsc --noEmit
```

实现采用测试先行：安全/服务/API/runtime/editor 缺失行为先 RED，再实现至 GREEN；常见导入名称与出站请求大小限制另有明确断言 RED → GREEN。Next fixture 编译还捕获过 `cacheComponents` 不接受 route 显式 runtime 配置，已删除冗余声明（默认 Node）。

独立主会话已用隔离 PostgreSQL 和本地 HTTP MCP 验证：完整 0000+0001 Drizzle 迁移及幂等、单行/正 revision/updater FK 约束、真实 CAS 并发一成功一 409、认证/CSRF、加密落库/秘密投影、真实 initialize/tools/list 且测试零 tools/call、原生点号工具/动态参数/全审批、原生 additionalProperties 完整保留、旧任务快照与下一任务禁用生效。仅对本地 fixture runtime 执行过工具调用，未调用真实 vendor 或模型。桌面与 390×844 窄屏实际浏览器还验证了精简常规页、友好 Bearer 接入、工具勾选保存、编辑/启停及站内确认取消/删除。临时证据保存在忽略目录 `.local-review/`，不随提交发布。

宽泛单测中的旧 browser-runtime 需要额外 Chromium，旧 regeneration-db 需要显式隔离数据库；它们不是上述纯离线专属命令的一部分。实际生产部署配置、网络信任与服务商额度仍需部署操作者核对。

最终独立验证共 67/67（41 个既有离线测试 + 26 个 MCP/部署回归），类型检查与 35 个变更文件的定向 lint 全部通过。干净隔离源码副本上的实际 `next build --webpack` 和 `next start` 均通过；管理 GET、能力摘要、跨站写入拒绝、匿名既有重定向及 config 资源追踪均做了实际 HTTP 验证。构建发现并最小移除了旧聊天 route 的非 Next 合法 helper export，内部聊天逻辑不变；没有关闭类型检查，也未使用 `pnpm build` 的迁移包装命令。
