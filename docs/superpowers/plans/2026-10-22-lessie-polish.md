# ChatNest 扁平化通用 Agent 工作台实现计划

> **面向 Agent 执行者：** 必须使用 superpowers:subagent-driven-development。步骤使用复选框语法跟踪。

**目标：** 打磨已批准、受 Lessie 启发的通用 Agent 展示，不硬编码任务，也不将通用产物面板特化。

**架构：** 聊天范围内的语义设计令牌配合现有组件结构。不引入新设计框架，不改变 Agent/运行时。一名 UI 实现者、独立只读审查、由主会话负责的隔离浏览器验收。

**技术栈：** Next.js 16 / React 19 / Tailwind / 现有 shadcn + AI Elements。

规格/计划审查：已获独立只读审查者批准；无阻塞项。基线显式 UI 测试：58/58。

## 阶段 1：扁平外壳与层级

文件：app/globals.css；components/chat/{shell,workspace,app-sidebar,chat-header,greeting,multimodal-input,activity-group,tool-activity,artifact,result-table}.tsx；必要时使用 components/ai-elements/tool.tsx。测试：tests/unit/{workbench-ui,chat-layout,activity-groups,text-editor-lifecycle}.test.ts。只扩展必要的相邻聊天展示组件，不做无关重构。

- [x] 添加聊天范围内配色、扁平外壳/工作区（不含 md:m-2/inset-2/圆角卡片）、对齐表头、通用产物类型和中性通用文案的失败展示回归。保留既有行为断言，并添加有意义的结构检查，不测试任意类名顺序。
- [x] 使用 env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test corepack pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts tests/unit/chat-layout.test.ts tests/unit/activity-groups.test.ts tests/unit/text-editor-lifecycle.test.ts 运行显式 UI 测试；预期新断言在实现前失败。
- [x] 设置仅限聊天的浅色/深色 surface/ink/muted/border/secondary/sidebar 语义设计令牌。采用中性柔和白色和克制的语义状态色。合理限定对话框作用域：不全局覆盖 portal 默认值。
- [x] 扁平化外壳/侧栏/工作区，同时不移除 min-w-0、覆盖层/调整大小/导航语义。使用匹配的 48px 表头、小圆角控件、细分隔线和一致易读排版。为键盘调整大小提供可见焦点；保留触摸/键盘目标尺寸。
- [x] 按需细化欢迎区/输入区/工具表头及通用产物/表格内部控件。不伪造状态、不设置固定任务流程、不添加法律专用标签或新导航。保持来源详情和精确工具参数可访问。工具失败/审批仍可发现，用户控件保留原始 ID。
- [x] 运行显式 UI 套件、tsc --noEmit --incremental false 及变更文件的 ultracite 检查。自查差异中的运行时变更、历史/撤销回归及移动端溢出；提交限定范围的实现。

## 阶段 2：独立审查与浏览器验收

- [x] 规格审查者对照已批准设计和保留的行为覆盖检查真实差异。实现者解决问题；审查者复查。
- [x] 代码质量审查者检查 CSS 作用域、无障碍、React 状态、产物不可变性及意外 Agent/运行时修改。实现者解决问题；审查者复查。
- [x] 主会话重新运行全部显式安全离线套件（绝不使用 tests/unit/*.test.ts）、类型检查、变更文件格式检查及隔离生产构建。绝不运行 pnpm build 或生产迁移。
- [x] 仅主会话恢复已忽略的本地 mock 模型/MCP + 夹具认证 Next 服务，端口为 33378/33379/33381，并使用专用 PG56508。不使用真实环境、不产生供应商费用、不使用客户文件。只使用 CUA 浏览器；若浏览器错误页已陈旧，则新开 HTTP 标签页。
- [x] 主会话测试真实 UI：空状态/新任务、上传/读取 PDF/Word/Excel、动态 MCP 审批与拒绝、成功打开通用文本/表格产物、重新加载后保留视图/备注、工具错误、文本输入/撤销。检查 390/1280/1440 浅色/深色截图，确保无整页溢出。保留通用图片/代码/工作表注册。
- [x] 用真实结果、限制和截图更新任务/地图/验证记录；私有合成夹具继续被忽略。保持可用预览开启。不宣称真实供应商或云端/后台已就绪。

### 浏览器反馈后续

文件还可包括 components/chat/{document-preview,toolbar}.tsx，以及限定聊天范围的侧栏宽度 provider 样式。用户当前真实页面反馈不接受过大重复内联预览和随意放置的垂直悬浮工具栏。添加有界紧凑通用预览和表头内辅助操作测试；保留全部操作、文档打开、只读保护和证据保护。细化易读标题层级及 224px 桌面导航，不影响管理后台/移动端。主会话重新验证真实文本/代码/图片/工作表产物，不能只测表格。继续由同一源码实现者负责；规格+质量审查者纳入本补充说明。

最终源码：40824f1。主会话验证了 233/233 项显式安全单元测试、类型检查、16 文件格式检查和隔离生产构建。独立规格/质量审查批准；浏览器反馈促成了真实组件生命周期回归及全高分隔条修正，不能仅凭源码正则检查验收。生产浏览器打开产物、重新打开同一卡片、通过键盘调整大小，并加载持久化表格，无控制台错误。
