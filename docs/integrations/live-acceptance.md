# 真实联调现状与下一轮边界

更新：2026-10-28。最新真实模型结果见 [DOCX／Ask／Porta／产物](2026-10-27-real-model-verification.md) 与 [PDF／Excel／Todo／停止和异常续跑](2026-10-28-real-agent-e2e.md)。模型服务已可用；供应商上游仍为合成数据，不代表生产验收通过。下表为 2026-10-24 历史快照，不作当前状态。CLI/skills 接入见 [宿主记录](porta-host-verification.md) 和 [接入指南](porta-hosts.md)。

## 当前结果

| 环节 | 本轮结果 | 证据与边界 |
| --- | --- | --- |
| ChatNest 运行交互 | 上轮已合并 | [PR #1](https://github.com/nodetime/chatnest/pull/1)：288 项离线测试及浏览器 mock 闭环；不是本轮真实模型验收 |
| 真实 Porta HTTP MCP | 已连接并调用 | 使用 Porta 的 `createApplication`、真实 MCP SDK、registry、原生参数与 provider；发现 `onebound_1688_item_search` / `onebound_1688_item_get`，实际调用搜索返回 3 条样本 |
| Porta 供应商上游 | 本地模拟 | 仅注入 provider 的 `fetcher`，将固定供应商目标改写至 loopback HTTP 服务；未知目标直接拒绝，没有真实供应商请求或计费验收 |
| 真实模型 | 尚未通过 | 项目没有 OpenAI/OpenRouter 配置；当前终端继承的兼容服务，其模型目录、Chat Completions、Messages 请求均返回 HTTP 502。复查响应由 Cloudflare 返回，明确标为 `Host Error`；这不是“所有模型不可用”的结论 |
| 上传 → Agent 自主调用 → 产物 → 重新打开 | 真实模型验收未完成 | 上轮 mock 结果继续有效；本轮 Porta 协议探测不能替代真实模型的整链路验收 |

本轮没有修改产品运行逻辑、模型选择、审批策略或通用产物展示。模型请求只含合成探测文本；未发送客户文件或在文档中保存密钥。测试服务只绑定 loopback。

## 下一次真实模型验收

1. 使用独立本地私密配置，先确认目标模型支持流式输出和工具调用；不把终端继承的服务自动视作产品正式模型。
2. 保留真实 Porta 进程与模拟供应商上游，连接名称、样本标题明确标注“模拟上游”。仅开放所需读取工具，保留审批。
3. 上传合成 PDF、Word、Excel；由真实模型决定读取、检索、核对和创建哪种产物，不用测试脚本替模型决定工具顺序。
4. 检查审批前零供应商调用、原生参数、工具返回来源、产物落库及离开后重新打开；另测失败、停止与恢复。
5. 分别记录“真实模型”“真实 Porta”“模拟上游”的证据。真实供应商账号、数据质量和计费另行验收。

参考：Porta 仓库的 `tests/e2e/providers.test.ts`、`tests/e2e/native.test.ts` 已提供真实服务配合 loopback upstream 的测试模式。直接用假 key 启动生产入口并不等于隔离；该入口仍会访问供应商。

## 下一轮建议：CLI 与 skills 配套，而非绑定

| 层 | 现状 | 建议边界 |
| --- | --- | --- |
| Porta 核心 | REST 与 HTTP MCP 共用 registry/provider | 保留官方工具名与参数；不要复制一套业务实现 |
| Porta CLI | `tools:list` 仅为开发期目录命令 | 下一轮可设计 `tools list`、`tools inspect`、`tools call`，通过同一 REST/MCP 服务执行，支持 JSON 输入输出、明确退出码、超时与脱敏错误 |
| ChatNest skills | 已有 `loadSkill` / `readSkillResource` | 描述任务方法、工具选择、证据核对及结果解释；不隐式执行 shell，不扩大工具权限 |
| CLI + skills | 尚未实现执行组合 | CLI 提供稳定执行接口；skill 教 Agent 如何使用。skill 也可直接调用 MCP，不强制经过 CLI |
| Vercel Agent 能力 | 现有 AI SDK 工具、审批、流式会话与通用产物 | 先完成真实模型验收，再按需要评估可恢复后台任务、执行预算和运行观测；不把框架组件等同于持久任务系统 |

本页是后续讨论入口，未承诺上述 CLI 或后台任务能力已经开发。
