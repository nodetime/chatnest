# 三方积分闭环对齐评审清单

日期：2026-10-30（America/New_York）  
状态：实施前对齐稿

## 1. 必须统一的产品口径

| 议题 | 建议决策 | 原因 |
|---|---|---|
| Porta 工具扣费时机 | 默认 `attempt` | 真实出站通常已经消耗供应商资源；错误/空结果是否收费由工具价格配置决定 |
| 未配置工具价格 | connected 拒绝 | 避免误把未定价能力当免费能力 |
| 模型与工具积分 | 同一钱包、分开 operation | 用户简单，账务和运营可区分成本来源 |
| Ask/Todo/审批 | 不单独收费 | 它们是 Agent 交互控制，不是供应商业务出站 |
| tools/list/discovery | 不扣用户积分 | 属于 metadata；Porta 可继续记录内部 usage |
| 超时/取消 | 待核对 | 不凭 HTTP 超时猜测供应商是否已执行 |
| 余额展示 | 只显示可用积分和简明记录 | 不把冻结状态机暴露给用户 |
| standalone | 保持独立运行，但不承诺平台商业能力 | 避免 disconnected 时切到无限额度 |

## 2. 三方接口对齐表

| 契约 | Payload | ChatNest | Porta | 对齐门槛 |
|---|---|---|---|---|
| 主体 | subject/account | local actor 映射 | 不直接读取用户主体 | `(platformId, issuer, subject)` 唯一 |
| 工具身份 | price key | AOP 生成 | receipt 回写 | provider/platform/api 完全一致 |
| operation | 钱包和状态 | 本地 execution row | receipt 关联 | operationId 全局唯一 |
| attempt | 结算幂等 | sending CAS | upstream attempt | 一次 attempt 最多一次出站 |
| permit | 签发 | transport 注入 | 校验 | 签名、tool、attempt 绑定 |
| receipt | report 输入 | outbox 发送 | usage ledger 生成 | receiptRevision 可重放 |
| 价格 | tool_prices | 不本地计算 | 不本地计算 | reserve 锁版本 |
| 账本 | wallet/ledger | 只读投影 | 不持有 | 单一写入方 |

## 3. TypeScript 合同策略

当前三方是独立仓库，不直接互相 import 源码。建议采用：

1. OpenAPI 3.1 / JSON Schema 作为跨服务规范；
2. Payload、ChatNest、Porta 各自生成或维护本地 TypeScript DTO；
3. 每端进入领域层前必须经过本端 `zod` 解析；
4. 契约测试使用同一组 JSON fixtures，覆盖正常、未知字段、缺字段、错误状态和版本升级；
5. branded IDs、判别联合和 exhaustive switch 只在本端实现，不把业务 ORM 类型跨仓库共享。

这样既能利用 TypeScript 类型安全，又不会把三方绑定成一个 monorepo。

## 4. 闭环检查点

### 账户闭环

- [ ] Payload 用户能注册、登录、退出、刷新和停用。
- [ ] ChatNest 能建立稳定外部主体映射。
- [ ] 旧本地 guest 不能在 connected 模式绕过平台账户。
- [ ] 平台会话撤销后，新工具调用立即停止。

### 权限闭环

- [ ] 平台权益、ChatNest 资源属主、任务能力范围和工具审批取交集。
- [ ] 当前配置修订变化后，旧审批不能扩大能力范围。
- [ ] 个人 MCP Key 仍只在 ChatNest 加密存储，不进入平台账本。

### 积分闭环

- [ ] 价格由平台唯一发布并带版本。
- [ ] reserve/dispatch/report/cancel 均幂等。
- [ ] 余额、冻结、账本和 operation 同事务更新。
- [ ] 结算未知时可重启、可查询、可人工结案。
- [ ] 用户积分和 Porta supplier cost 不互相换算。

### 工具闭环

- [ ] 所有静态 provider 和 Native MCP 都经过统一 AOP。
- [ ] permit 不进入工具参数，不被模型看到。
- [ ] required 模式缺 permit 时供应商出站为 0。
- [ ] 同一 attempt 不被重试成第二次供应商请求。
- [ ] tools/list 不产生用户积分 operation。

### 产品闭环

- [ ] 用户能看到余额、最近使用记录和明确失败原因。
- [ ] 管理员能发放、补偿、调价、查看 operation 和人工结案。
- [ ] 运营能够区分模型积分、工具积分、供应商成本和未知状态。
- [ ] 平台不可用时不静默切换免费或无限模式。

## 5. 实施前需要确认的五个决策

1. **收费时机**：一期是否全部使用 `attempt`；建议是。
2. **模型收费**：是否和工具积分共用钱包；建议共用但分组展示。
3. **价格管理**：env 只做种子，Payload 表做生产源；建议是。
4. **Permit 密钥**：平台签发、Porta 验证，还是 ChatNest 代签；建议平台签发、ChatNest 透传。
5. **Payload 仓库**：业务应用仓库名称、部署地址、数据库和发布责任人需要明确。

## 6. 进入实现的门槛

以下条件全部满足后再写生产代码：

- 三方 canonical tool identity 已冻结；
- `attempt`/`success` 语义已冻结；
- API 错误码和状态机已冻结；
- Payload 平台仓库或最小契约 fixture 已可访问；
- OpenAPI/JSON Schema 契约测试骨架已建立；
- connected、standalone、required、receipt 四种模式的验收边界已写入测试计划。

