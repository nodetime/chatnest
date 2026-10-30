# 平台积分闭环本地验收记录

日期：2026-10-30（America/New_York）  
分支：`codex/platform-points-closure`  
范围：ChatNest + Porta 代码、协议 fixture、合成平台 HTTP、合成上游

## 已验证

### ChatNest

- `corepack pnpm check`：Ultracite 检查通过，411 文件无诊断。
- `corepack pnpm typecheck`：通过。
- `bash scripts/ci/offline-checks.sh tests`：443 项，439 通过、4 项显式 opt-in 真库测试跳过。
- `corepack pnpm db:check`：迁移检查通过。
- 新增领域/平台/AOP/fixture 重点测试：12 项通过。
- 本地平台 HTTP fixture：reserve → dispatch → sending CAS → supplier-style result → report，余额从 10 扣到 8，operation 只创建一次。
- `default=deny`、固定调用、reported-unit cap、overage、connected 无平台旁路、permit 注入边界均有测试覆盖。

### Porta

- `corepack pnpm check`：通过。
- `pnpm build`：通过。
- `pnpm typecheck`：通过。
- `pnpm test`：398 项通过。
- `pnpm boundaries`：通过。
- `pnpm lint`：239 文件无诊断。
- `pnpm docs:check`：252 份文档检查通过。
- `PORTA_BILLING_MODE=required` HTTP 测试：无 permit 出站 0；有效 Ed25519 permit 出站 1 并返回 receipt。
- permit 过期/工具绑定/attempt replay、receipt 签名、receipt 查询和供应商成本账隔离均有测试覆盖。

## 三方契约

已建立 ChatNest 作为当前协议源快照、Porta 作为同步快照的 v1 OpenAPI/JSON Schema：

- `docs/contracts/platform-points/openapi.yaml`
- `docs/contracts/platform-points/schemas/operation.json`
- `docs/contracts/platform-points/fixtures/canonical-json-vectors.json`

Payload 业务仓库已接入：`/Users/nako/Documents/ChatGPT/NexaZ/heymoro-starter`。本次验收使用该仓库的真实 Payload HTTP 服务、PostgreSQL、userSessions、wallets、billingPolicies、billingOperations 和 ledger 表；不再把 ChatNest fixture 当作平台实现。

## 未宣称的范围

- 未调用真实付费供应商；Porta 上游均为合成或本地 fixture。
- 未进行真实支付、套餐、用户注册、密码、停用和线上钱包验收。
- 未把本地 Porta 合成供应商数据写成真实供应商或生产结果；Payload 账务本身已完成 loopback connected 验收。
- 未执行 `pnpm build` 的 ChatNest 生产构建，因为项目纪律明确禁止该命令触发迁移；已执行 typecheck、lint、offline tests 和 migration check。

## 下一外部验收门槛

1. 将当前 Payload 本地地址替换为部署地址，并由部署环境注入服务 token、用户 token 和 Ed25519 key；
2. 将现有 wallet/policy/session/ledger 契约测试接入部署环境；
3. 将 ChatNest 的 per-user platform token 从验收 env 适配为正式 identity exchange；
4. 最后再进行真实供应商账户和真实扣费核对。


## 会话级模型/工具账务验收

- Payload `billingSessions` 是展示聚合根，`billingOperations` 是不可重复的子步骤；模型 request 与 Porta tool call 使用同一个 `sessionGroupId`。
- 模型收费策略键为 `model/<modelId>`，工具收费策略键为 Porta canonical key；两类步骤可以配置不同 `pointsPerCall`。
- `GET /api/platform/v1/sessions/:sessionGroupId` 和 ChatNest `GET /api/chat/billing` 均返回 totals + steps，步骤包含 reserve/capture/state/outcome/receipt。
- connected 模式下缺少 Payload 用户 token 会 fail-closed；不会降级为 standalone 或免费模型调用。

### 本次三方实际链路输出

- ChatNest 的真实 `PlatformBillingClient` / AOP 直连 Payload `127.0.0.1:3000`，再把 Porta permit 带到 `127.0.0.1:33383`。
- 同一 `sessionGroupId=chatnest-real-e2e-1` 完成 `model/chat-model=3` 与 `onebound/1688/item_search=2` 两步；`totals.reservedPoints=5`、`totals.capturedPoints=5`。
- 两步均为 `settled` / `response`；工具步骤收到签名 Porta receipt，Payload session details 可逐步查看扣费明细。
- 单步结束后 `billingSessions.status` 自动变为 `completed`；若存在 `unknown`，则保留 `reconcile_pending`，不提前标记完成。
