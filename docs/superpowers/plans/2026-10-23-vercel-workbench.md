# 基于 Vercel 的工作台实施计划

> **供自主执行任务的代理使用：** 必须使用 superpowers:subagent-driven-development。一名源码修改者；独立审查；仅主代理负责浏览器/测试夹具/构建。

**目标：** 用真正的官方基础组件和实用的通用 Agent 交互替代临时拼装 UI，而非再做一轮外观调整。

**架构：** 保留现有状态/传输/持久化。固定补充的 AI Elements Artifact/Task 版本；组合现有 Conversation/PromptInput。纯原生产物目录和标题投影为上下文界面提供数据。共享标题栏消除重复工作区/文档栏。

**技术栈：** 现有 Next16/React19/AI SDK7/shadcn/Radix/Tailwind；不新增包。

## 分块1：官方组件组合与上下文工作区

新增文件：components/ai-elements/{artifact,task}.tsx；纯逻辑 components/chat/artifact-catalog.ts 和 chat-title.ts（或按职责一致原则放在 lib/artifacts/）；components/chat/{artifact-picker,workspace-header}.tsx。按需修改 components/chat/{chat-header,multimodal-input,messages,workspace,artifact,activity-group,shell,greeting}.tsx；hooks/use-active-chat.tsx 仅暴露现有标题数据；app/(chat)/api/messages/route.ts 仅使用现有受保护标题字段。更新 THIRD_PARTY_NOTICES.md 并添加完整上游许可证文件。新增定向 tests/unit/vercel-workbench.test.ts，保留 workbench-ui/layout/activity/lifecycle 测试。CSS 如有需要，仅限定于聊天范围。

- [x] 阅读地图/教训/规格和实际源码。记录固定版本的 Artifact/Task 源码和许可证；不使用最新安装器、演示，不进行模型调用或迁移。
- [x] 编写失败测试，覆盖经验证的目录（仅原生成功项、拒绝已知错误、ID 去重/最新标题、不修改原数据）、标题兜底/实时标题、单标题栏/官方组件组合、输入区模型、真实逐聊天文件选择及未保存/流式保护。运行定向测试证明为红。
- [x] 通过命名空间导入适配官方基础组件，避免与业务 Artifact 冲突；保留许可证+修改声明。Task 触发控件必须使用原生 button。不增加冗余设计框架/依赖。
- [x] 仅使用实际当前聊天消息构建目录+选择器。通过原 openArtifactPreview + 显式展示工作区文档完成选择。实际产物流式生成/未保存编辑期间禁用选择；失败时保留当前视图。空工作区允许用户选择现有项目。
- [x] 构建共享标题栏组合：当前文件+选择器/操作/展开关闭，以及文档/浏览器/来源键盘菜单；活动文档外层不再有重复48px工作区栏。原有各类型回调、表格保护/历史记录及文档获取/保存不变。
- [x] 上下文会话标题 + 底部模型选择；通过 PromptInput 子组件组织原有上传/文本/按钮。不用上游演示的 base64 行为替代私有上传。
- [x] 组合现有 Conversation，以聊天为 key 且仅有一个滚动所有者；移除冲突的自定义滚动容器；所有 SDK 部分和回调保持原始顺序。Task 包裹原有展开/状态逻辑，不充当计划引擎。
- [x] 运行明确列出的定向 UI/目录测试、tsc --noEmit --incremental false 和变更文件 ultracite；检查自身差异，仅提交源码/测试/声明。主代理负责跟踪文档和 .local-review。

## 分块2：审查与独立验证

- [x] 独立规格审查者：对照规格检查实际组件/交互；正确集成且不新增固定工作流。修改者解决问题，审查者复查。
- [x] 独立质量审查者：检查生命周期/撤销/memo/焦点/滚动、原生目录权威性、旧聊天泄漏、标题授权、重复界面、未保存/流式保护和许可证。修改者解决问题/复查。
- [x] 主代理运行明确列出的完整安全离线清单、类型检查、格式检查；隔离依赖克隆 + 直接 next build --webpack（绝不执行迁移构建）。
- [x] 主代理 CUA 测试多文件/类型选择、保存后切换、关闭/模式/刷新/新聊天隔离；真实上传/读取+HTTP MCP 审批/表格；手动长流式输出滚动/跳转、停止/编辑；表格来源/CSVJSON/历史；移动端及6张浅色/深色视口截图、生产冒烟。不将截图或测试夹具放入跟踪源码。
- [x] 记录实际限制/结果，保持源码干净，保留预览。仅在主代理验证后本地合并；不声称远程发布。
