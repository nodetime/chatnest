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

Payload 业务仓库尚未在当前工作区。以上 fixture 证明协议和 AOP 可运行，不证明真实 Payload 账户、钱包、后台和生产数据库已经部署。

## 未宣称的范围

- 未调用真实付费供应商；Porta 上游均为合成或本地 fixture。
- 未进行真实支付、套餐、用户注册、密码、停用和线上钱包验收。
- 未把本地平台 fixture 结果写成 Payload 生产验收。
- 未执行 `pnpm build` 的 ChatNest 生产构建，因为项目纪律明确禁止该命令触发迁移；已执行 typecheck、lint、offline tests 和 migration check。

## 下一外部验收门槛

1. 提供 Payload 业务仓库或部署地址、API v1、数据库和签名 key owner；
2. 用真实 Payload 账户完成 identity/access/wallet/ledger/operation 契约测试；
3. 验证 connected 会话中的 `platform.token` 注入和撤销；
4. 在不使用合成平台 fixture 的情况下重复 reserve/dispatch/report/reconcile；
5. 最后再进行真实供应商账户和真实扣费核对。

