# 平台协议生成链

当前 wire revision：`2026-11-03.4`；API `v1`；积分 scale `1000000`。

## 所有权与生成范围

- ChatNest 的 `source.json` 是 definitions、OpenAPI operation 描述、published schema 映射、fixture 清单和 canonical 签名字段顺序的唯一可编辑来源。
- `manifest.json` 只拥有 API/revision/积分 scale 元数据。`source.json` 中 permit version const 必须与 manifest 一致。
- `scripts/ci/contract-emitter.mjs` 是有明确支持范围的 JSON Schema → Zod/TypeScript 编译器；`contract-artifacts.mjs` 先验证 schema 关键字取值，再渲染产物。
- `generate-contract-constants.mjs` 保留旧命令名，但已生成 OpenAPI、独立 JSON Schema、bundle、三仓 Zod/types、签名字段、版本常量、fixture 镜像、routes/wire registry 及内容索引。Porta core 使用纯类型生成物，不引入 Zod 运行依赖。
- Payload 的 permit 签发/receipt 验签、Porta 的 permit 验签/receipt 签发以及 ChatNest reserve/dispatch 响应已消费生成物；Payload 的 25+2+4 个 route 已由 `bindPlatformHandlers` 从单源装配；Porta receipt path/method 与输出 validator 也已消费生成物。其余 body/query/path/header 与成功/错误 response guard **仍在实施**，不将 registry 装配等同于完整边界校验。

## 公共关联ID（2026-11-03.1）

31条Payload operation统一声明可选X-Request-Id；提供时必须为非空1..128字符，来自唯一RequestId定义。认证/现有入口消费生成RequestIdSchema或同源生成header schema；坏值在业务审计前400，不截断/换调用方ID，省略仍允许。AuditLogs两字段maxLength引用由同一定义生成的PLATFORM_REQUEST_ID_MAX_LENGTH，物理预算仍128，不增加迁移或旧revision兼容。该header不是签名原始body字段，provider原体验签不改写；Porta receipt未被本批增加公共H，其剩余边界另列。

## AttemptId与receipt路径（2026-11-03.2）

AttemptId定义复用于reserve/report、permit/receipt、operation/session-step及receipt P/response。1..128 Unicode码点，排除独立dot段、NUL和未配对surrogate，以保证标准URI component及数据库可传输；百分号/斜杠/组合Unicode保留原义。receipt调用方encodeURIComponent一次，服务只decode一次，不trim/NFC/二次解码；裸额外路径段或坏percent/UTF8为400。GET-only、缺记录404、读故障/坏输出503，先认证，不因查receipt重调供应商。Porta required/receipt共用准入校验；坏输入403，已提供的坏签名key在初始化以503配置错误失败，不把服务配置坏归到调用方。

## 历史：支付核心事实（2026-11-03.3）

NormalizedPaymentEvent/payment-event.json现在描述实际业务规范化事实（eventId/eventType/provider，金额/主体/引用及可选signed decimal points），不是provider签名原体。Payload现有normalizer直接消费生成schema；runtime只把points转bigint pointUnits，没有number积分副本。非Stripe只接受providerEventId/eventType；Stripe采用原生id/type/data.object/account，不保留旧别名或flat兼容。原体仍原样验签和存证，退款来源/checkout归属由原kernel核验。原生account定义见[Stripe Event源类型](https://github.com/stripe/stripe-go/blob/master/event.go)；[事件参考](https://docs.stripe.com/api/events/retrieve)区分charge.refunded的Charge与refund.created的Refund，解析器不将Charge ID冒充refundId。

发布的PaymentWebhook仍未覆盖所有实际raw业务输入；不能直接拿strict generic schema验证原生Stripe body。订阅字段/时序、Event顶层created、原生退款差额/争议业务等尾项见主TODO，未称完整provider验收或正式可上线；本revision不添加旧格式转换层。

## 原始事件、时间与订阅事实（2026-11-03.4）

PaymentWebhook现在是运行时消费的generic strict raw定义，ProviderWebhookRequest将它与native StripeWebhookRequest组成路由union；NormalizedWebhookRequest重复定义已删除。native只支持v1 snapshot envelope（created整数秒/data.object），保留provider扩展字段；并非Stripe thin/v2或全部原生财务事件政策。normalizer继续统一校验已消费事实，handler不再读取raw订阅/expiry。原始payload仍原样验签/存证，不使用Zod规范化后对象替代签名body。

[Stripe Event源类型](https://github.com/stripe/stripe-go/blob/master/event.go)区分Event.created与data.object：native时间只取前者，normalizer输出occurredAt；generic只用occurredAt，不维护createdAt/timestamp别名。generated日期约束含真实日历/时区；expiresAt必须有效ISO日期。订阅facts严格status、nullable日期、boolean/metadata；取消事件可证明canceled，其他缺状态拒绝。省略不清旧字段、null/false显式，事务单键锁后不可换user/org、合并后不得反向账期。

完整native支付/退款/争议/订阅映射、乱序与版本仍待，不能以raw/schema通过认定正式provider成功，详情统一见主TODO。上节2026-11-03.3的raw描述是该批历史状态，本节为当前。

## 命令

在 ChatNest checkout：

```sh
pnpm contract:generate
pnpm contract:generate --check
pnpm contract:generate --target=chatnest --check
pnpm contract:check
pnpm contract:runtime
pnpm contract:http:acceptance
pnpm contract:parity
```

- 默认三仓生成；非标准 checkout 位置用 `PAYLOAD_ROOT` / `PORTA_ROOT` 显式传入。格式化使用各仓已安装的 formatter，生成前先安装依赖。
- 每仓 `pnpm contract:check` 只读取本仓：校验 source digest、产物必需集合、版本常量、schema/fixture/类型/validator 的内容 hash，缺失或变更非零退出。
- 本地 hash 检查是**误改检测**，不是重新编译或可信签名证明。producer CI 仍需 `contract:generate --check`；`contract:parity` 的历史字符串检查不是 runtime 协议证明。
- `contract:runtime` 明确依赖三个 checkout：实际调用 Payload 签发 → Porta 验签、Porta 签发 → Payload 验签，并以独立 AJV 校验对照三仓实际生成模块。密钥仅内存临时生成，不调用模型/供应商，不写生产环境。
- 单仓 offline manifest 包含 emitter/artifacts/local-check 测试，不包含需要兄弟仓的 runtime 联验。

## 兼容边界

- receipt 的 `dispatchEvidence`、`httpStatus`、`supplierUnits` 为必填；键和值长度有界；额外字段拒绝。签名仍可在结构类型中省略，但 Payload 验签路径要求有效签名。
- receipt 公钥选择来自部署配置 `PORTA_RECEIPT_KEY_ID`（默认 `porta-ed25519-1`），不允许 receipt 自带 `keyId` 改写公钥选择。此前宽松入口接受额外字段的行为已收紧；变更前需确认调用方遵守协议。
- permit/receipt canonical 字段顺序保持原实现，不根据 object key 排序重写签名字节。
- date-time 使用声明在 source 的 RFC3339 子集：大写 T/Z、必须含秒、支持小数秒与带冒号 offset、不接受闰秒；同时校验真实日历日期。
- 字符串长度按 Unicode code point；整数语义不偷偷追加 JS safe-integer 上限。
- 暂不支持复杂对象 const/enum、局部 `$defs`、循环/外部引用、ref sibling 约束、oneOf/anyOf 同时出现以及未实现的关键字/format；生成阶段失败退出，不丢约束继续输出。

## Operation registry 与验证 lookup

`runtimeOwners` 定义各 owner 的服务端路由前缀；每个 OpenAPI operation 的 `operationId` 与 `x-runtime` 定义 owner、handler、order 和现有授权策略。当前 32 个 operation：Payload billing 25、identity 2、payments 4、Porta receipts 1；64 个 definitions；没有 generic Success。

- `generated/routes.ts`：生成 path/method/handler/owner/status→schema 描述，`bindPlatformHandlers` 要求提供的 handler 集合精确匹配；缺失、额外、非函数 handler 都失败退出。auth 元数据**描述现有 policy**，不替代业务授权。
- `generated/wire.ts`：按 operation id 查询 body/各 HTTP status 的 Zod validator；未声明的响应 status 抛错，不回退成任意 object。
- 所有 Payload route 均真实消费 registry；Porta receipt GET 真实消费 path/method 与 success validator。匿名 identity/payment handler 仅提为具名，函数体/事务/授权保持不变。
- `contract:http:acceptance` 只允许 loopback HTTP；使用私密环境的 service token 和已有 mapped fixture admin，验证当前真实管理读取/400/401/403 响应，不打印 token 或原始响应。不是所有32个operation的E2E覆盖。

## 尚未关闭与兼容说明

- 完整 request/query/path/header normalization、业务 refinement、各成功/错误输出 guard 及事务内输出验证尚未全面接线。写入后的输出校验必须与事务/幂等衔接，不能简单在 commit 后丢弃响应制造假失败。
- 真实 handler 允许 trim 后 reason、numeric webhook point 和 provider 扩展字段；source 保留这些兼容输入，不伪称未知字段统一拒绝。API 规范与规范化后的业务输入需分层。
- wallet adjustment entry已在续批改为strict标量白名单；首次/duplicate两wire分支均受guard，详情见钱包续批。
- PaymentReconcileResponse 已包含必填 failed（单项非2xx数量）；ChatNest额外生成 `scripts/generated/payment-recovery-schema.mjs` 供无TS loader的worker校验。worker兼容完整legacy事实，独立核对reconciled/events/failed；缺事实或计数矛盾拒绝，不再默认零。该CLI产物已纳入单仓必需清单和跨仓重新生成检查。
- ChatNest adminOverview 原始HTTP解析已消费生成schema，移除缺字段默认0/空数组；独立告警页只投影计数与枚举状态，不返回provider自由文本。
- PlatformPlan.priceCents现为非负safe-integer number，与collection/金额边界/迁移CHECK一致；生产存量盘点与VALIDATE须按金额方案执行，旧授予积分快照另行治理。
- 声明的 errors 覆盖已知显式分支；若业务直接抛出未捕获 required/数据库异常，框架错误不因文档而自动变成稳定 Error DTO。后续 guard 要补真实异常路径回归。


## 钱包调整续批（2026-11-01）

- 原始ledger entry泄漏边界已修复：稳定strict白名单，仅标量user/organization及账务事实，剔除metadata、关系展开和未来集合字段；source与三仓生成物同步。
- ChatNest adjustWallet改消费生成的首次/duplicate联合schema；合法重放从entry.balanceAfter返回“该操作完成时余额”，不读当前钱包、不默认0，修复此前duplicate被强制balancePoints误判502的问题。Payload保留原duplicate wire分支，不为旧strict消费者新增顶层字段；跨版本需同步部署生成schema消费者，旧raw entry不被新strict schema静默接受。
- Wallet handler补正整数path、生成body schema、header幂等键优先/body fallback、条件审批字段400；授权先于body读取。重复键须对应adjustment事件/operationId/sessionGroup及同主体/组织/金额，不接受其他账务事件碰撞。
- 输出校验位于事务commit前，并核对响应entry与请求主体、delta、幂等键和余额的一致性；失效503触发rollback。数据库异常统一脱敏503，组织查询异常不再回传原始Error.message。
- 已补12个handler边界测试与3个真库测试（历史余额重放、真实余额/ledger/audit回滚、并发同键仅一次变更），ChatNest真实client两wire分支与敏感canary拒绝测试。
- 剩余：其他operation完整guard与稳定错误映射、金额整数/存量约束、告警历史持久化与非零风险真库UI、正式外部依赖和部署证据；本批没有扩大成功声明到这些范围。

## 核心operation运行边界（2026-11-01续批）

- reserve、report/internalReport消费生成request；四条operation成功输出消费生成response，dispatch沿用path-only契约（不新增body语义）。reserve新增503已生成到registry；report标识长度/usage安全上限与legacy receipt别名明确进入source。
- report绑定path/body/存量attempt；reserve幂等绑定subject/session/model/step及账务主体。所有operation成功输出在commit前校验，未知异常脱敏503；ChatNest report拒绝非terminal状态作为成功。
- 事务行锁/advisory锁及受保护permit/usage内部补读是业务并发边界，不由JSON Schema或auth元数据自动提供。schema通过不意味着并发安全；真实DB竞争与HTTP链证据见实施验收最新章节。

## 会话分页与聚合（2026-11-01续批）

- 当前66 definitions/32 operations；`SessionPage`为详情必需，query支持limit1..1000/cursor。新服务必须返回完整page，旧无page消费者兼容由ChatNest client显式处理，不以legacy fallback吞掉坏page。
- `SessionAggregatePoints`只用于会话summary/total，支持64位整数+6位小数；单笔operation与wallet仍原19位。numeric SUM输出text，不经过JS Number。
- cursor为group-scoped复合排序+id高水位，非跨HTTP金额/状态冻结。实际Payload handler统一使用Local API sort数组；状态写入聚合与金额展示分离。
- 本地2501步真库/浏览器全遍历与身份隔离已验；不扩称全32端点guard或正式外部E2E。完整证据见实施方案最新章节。

## 到期回收guard（2026-11-02续批）

- `billingExpireWalletGrants`明确409/503；`ExpireWalletGrantsResponse.expired`为整数0..1000，不接受负数/小数/缺requestId。三仓同源生成，定义数仍66/operation32。
- Payload整批事务输出precommit，未知异常固定503；busy/历史ledger冲突409，不作为成功0。ChatNest client消费生成schema，worker failed计数触发CLI非零，即使sink和history均成功。
- 此约束不证明grant剩余/消费/退款归属；完整allocation P0尚未实现。真实HTTP、回滚、worker/历史证据及发布阻塞见实施方案最新章节。
