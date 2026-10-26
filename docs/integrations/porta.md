# Porta / 1688 接入

## 范围与实施计划

Porta 是独立同级服务，不是 ChatNest 源码依赖。ChatNest 使用已固定的 `@ai-sdk/mcp@2.0.7` HTTP 客户端发现原生工具；供应商鉴权与请求边界由 Porta 负责。现有 Exa 与正文调查 Skill 保留。

- [x] 先新增独立配置、环境替换、安全门禁、工具确认及 Skill 测试，观察预期失败。
- [x] 新增可选服务及服务端连接解析；缺配置或非法环境 URL 仅跳过该服务。
- [x] 新增商品与主体线索调查 Skill 和环境参数示例，不增加业务编排或供应商参数/返回转换。
- [x] 在 ChatNest 根目录运行独立测试、既有回归、类型与格式检查。

## 服务端配置

在部署者维护的环境配置里设置（不要发送到聊天、前端或 Git）：

```dotenv
PORTA_MCP_URL=https://bridge.example/mcp
PORTA_SERVICE_TOKEN=
```

两个变量任意缺失时不连接 Porta，Exa 等已有服务照常初始化。`PORTA_SERVICE_TOKEN` 是 Porta 自己的服务 bearer token，不是 OneBound key/secret。OneBound 凭据只放 Porta 服务端。

`url` 可为完整 HTTPS URL 或完整 `${ENV_NAME}` 引用，不支持主机/路径片段拼接。引用只解析一次；拒绝 URL 中的用户名/密码、片段、空白、反斜线、非 HTTP(S) 协议。变量替换后再次校验，不把 URL 或 header 密钥发到能力端点或系统提示中。MCP fetch 拒绝重定向，避免请求跳出已验证的端点。

本地开发联调使用额外显式 opt-in：

```dotenv
NODE_ENV=development
AGENT_MCP_ALLOW_LOOPBACK_HTTP=1
PORTA_MCP_URL=http://127.0.0.1:3334/mcp
PORTA_SERVICE_TOKEN=
```

只有 `NODE_ENV=development` 或 `test`，且 opt-in 精确为 `1` 时才允许 loopback HTTP（`localhost`、`127.0.0.1`、`[::1]`）。未指定环境及 production 均保持 HTTPS；内网 IP、任意域名和公网 HTTP 不在允许范围。Next 开发命令会设置 development；不要用改 production 环境名的方式部署生产服务。静态配置 URL 仍要求 HTTPS，本地 HTTP 通过完整环境引用配置。

默认仅允许以下远端工具，运行时别名在前面加 `porta__`：

- `onebound_1688_item_search`
- `onebound_1688_item_get`
- `onebound_1688_item_get_shop`
- `onebound_1688_item_get_company`
- `onebound_1688_upload_img`
- `onebound_1688_item_search_img`

六个工具全部默认需要用户确认；读取与查询同样可能收费，不自动重试或批量补全。部署者可编辑配置，但不应把收费工具加入自动批准列表。此接入不调用真实模型，也不证明供应商真实账户/付费调用可用。

## 错误的必要协议适配

成功以及供应商 `error_code=0000`、`2000`（无结果仍可能收费）保持原 MCP 返回，不把无结果改为失败。Porta 将真实供应商错误（例如 `4008`）、HTTP失败及 `porta_error` 桥接错误标记为 `isError`。

ChatNest 对 Porta 的 `isError` 继续抛工具执行异常，以保持 AI SDK/UI 的 `output-error` 状态，而不是把错误对象当作成功结果。异常文本的最后一行保留错误正文的 JSON 序列化形式（保留字段、类型、null和嵌套结构，不承诺字节或空白一致）；非JSON正文作为JSON字符串保留。只取文本正文，缺少文本时才取 `structuredContent`，不序列化任意MCP `_meta` 或传输headers；已配置header凭据及Bearer token的回显额外替换为 `[REDACTED]`，覆盖字符串值与动态JSON属性名；若脱敏产生属性名碰撞，则显式返回本地 `porta_error.code=error_redaction_collision`，不静默覆盖或丢掉某个供应商字段。上游供应商凭据的脱敏仍由 Porta 负责。

仅本地创建的 `PortaToolError` 通过窄化的 stream `onError` 公布上述正文；其他工具/网络/服务器错误保留 SDK 默认脱敏，不能靠伪造错误前缀绕过。错误正文被明确标为不可信数据，不是指令，不触发执行或自动重试。查询可能已收费；不再提示笼统的“稍后重试”。这是保持失败状态与原始错误语义所需的协议适配，不是供应商错误归一化。

## Skill

`source-1688` 是独立商品与主体线索调查方法（辅助律师整理疑似仿冒、竞品与销售主体线索，不判定侵权）；正文调查仍使用 `investigate-content`。模型按需加载方法，按当前已发现工具的 schema 和官方接口说明填写供应商原参数，不归一化枚举/分页，不捏造原始返回里没有的字段。

图搜、上传只在确有需求时使用；大 base64 可能超出消息或工具请求边界，失败应说明缺口，不静默拆分或重复收费。`upload_img` 的 `name` 返回值没有被当作 `item_search_img.imgid` 的通用转换规则。

## 离线验证

在 ChatNest 根目录运行：

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec tsx --test server/infrastructure/skills/porta.test.ts server/application/chat/porta-errors.test.ts server/infrastructure/mcp/agent.test.ts server/domain/message/message-turn.test.ts server/application/ai/model-connection.test.ts server/infrastructure/browser/browser.test.ts app/_components/chat/task-experience.test.ts
corepack pnpm exec tsc --noEmit
corepack pnpm exec biome check server/infrastructure/mcp/config.ts server/infrastructure/mcp/runtime.ts 'app/(chat)/api/agent/route.ts' server/infrastructure/mcp/agent.json server/infrastructure/skills/porta.test.ts server/application/chat/porta-errors.test.ts server/infrastructure/mcp/agent.test.ts
```

测试只使用 fixture token、注入的 MCP 连接器和既有本地模型 fixture，不读取 `.env`、不连接真实模型/OneBound。真实本地 HTTP MCP 协议与 SDK 兼容性由独立 Porta 仓库的 transport 测试覆盖；本文件的注入连接器测试不冒充真实网络验收。

## TDD 记录

2026-10-20：

1. RED：新增7项独立测试，运行 `corepack pnpm exec tsx --test server/infrastructure/skills/porta.test.ts`，7失败/0通过；失败定位到未注册服务、URL引用未支持、缺少连接解析、未加载采购Skill等预期缺口。
2. GREEN：最小实现后，独立7项及既有15项 agent 测试全部通过（22/22）。
3. RED：增加真实本机HTTP重定向测试，定向运行 `--test-name-pattern='rejects redirects'`；出现 `redirectedCalls: 1 !== 0`，证明原有fetch会跟随重定向。
4. GREEN：MCP fetch 显式 `redirect: error` 后，独立8项与 agent/message-turn/model-connection 回归全部通过（29/29）；既有模型测试只使用本机HTTP fixture。
5. 最终离线回归（加 browser/task-experience）37/37通过；`tsc --noEmit`、上述6文件 `biome check` 与 `git diff --check` 均退出0，无格式诊断。冻结锁文件安装完成，依赖/锁文件未改动；安装器提示忽略若干依赖构建脚本，不影响以下实际验证。未运行会自动读取真实 `.env.local` 的数据库迁移/生产构建命令，也未执行真实模型或付费供应商验收。


## 错误语义修复 TDD

1. RED：新增 `porta-errors.test.ts`，成功/0000/2000回归通过，原始错误体保留与专用UI错误通道2项失败；明确观察到通用异常丢失原JSON。
2. GREEN：仅Porta专用异常与窄化stream formatter实现后3/3通过。真实AI SDK使用纯本地Mock模型，依次验证 `streamText` 的 `tool-output-error` 事件和 `readUIMessageStream` 恢复的 `output-error` 状态，不把工具错误显示为成功；4008、BridgeError、敏感元数据与token、执行次数覆盖在内。

3. 追加RED：header token作为JSON属性名时出现泄漏断言失败；递归键/值脱敏与碰撞拒绝后4/4通过。配置显示名为“Porta 1688 数据查询”，Skill展示与交付定位为“1688商品与主体线索调查”；原工具参数和费用/图搜规则保持。

## 真实本机跨仓联调

私有、Git忽略的runner位于 `.local-review/porta-runtime-integration.mts`（使用`.mts`避免被项目`**/*.ts`类型检查纳入跨仓临时文件）。在ChatNest根目录复跑：

```sh
corepack pnpm exec tsx .local-review/porta-runtime-integration.mts
```

该runner直接连接真实 `createAgentRuntime` / 固定MCP SDK → 同级Porta `createBridgeServer` → `OneBoundClient` → 注入的真实本机HTTP供应商fixture；只在最后一段fetch边界改向本机，没有替换MCP连接器。发现6工具且全部需要确认，发现阶段0供应商请求；成功/0000/2000返回保持原字段、字符串大ID、null与未知字段；4008经实际SDK恢复成UI `output-error`且保留原错误正文。5次执行对应恰好5次本机vendor请求，无自动重试；0付费供应商调用、0真实模型调用、0环境文件读取。模型流采用明确MockModel，仅用于驱动工具执行及UI错误状态。runner关闭两台临时HTTP服务、恢复它改动的环境变量并清理临时配置。它不是可提交产物，也不是付费上游验收。

本阶段最终复验：上述7个离线测试文件 **41/41通过**，`tsc --noEmit`、9个相关代码/配置文件的 `biome check` 与 `git diff --check` 全部退出0；私有跨仓runner再次退出0。依赖与锁文件、原有 `investigate-content` Skill 均未修改；接入代码保存在独立开发分支，不推送主分支。
