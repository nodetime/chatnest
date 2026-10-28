# Lessie 工作空间统一打磨实施计划

> 按已批准设计执行，独立只读复核；只改呈现，不增加 Agent 或商业能力。

**Goal:** 数知探AI首页、对话、产物、个人管理形成一致的轻盈工作空间。
**Architecture:** 复用现有 shadcn、AI Elements、Next Image 和数据钩子，更新语义token及组件布局；不追加一套工作流或样式框架。

- [x] 在既有 workbench-ui 与交互测试中先声明新布局/语义与不变量，确认红灯。
- [x] 统一 globals 的主/次表面与深色变量、侧栏密度；调整 shell、greeting、workspace-home 与输入区，最近内容只来自已有API。
- [x] 调整 chat-header、消息/附件/工具/Ask/Todo 的呈现，保留回调、状态和所有可访问标签。
- [x] workspace-header 标题与 controls 分层；artifact-picker 保持可收缩；不重挂载编辑器或改变保存/来源。
- [x] personal-connections、personal-skills、workbench-section 与 agent-library 使用统一列表、面板与设置导航；保留编辑、删除确认、属主和密钥行为。
- [x] 先绿色聚焦测试，再核对正常预览；隔离UI夹具覆盖运行/等待/失败/长内容/产物开关；不把固定模型当真实模型。
- [x] 1440/390、明暗、键盘、长标题、输入底部布局检查；记录实际通过与未验边界。
- [x] 更新CODEBASE_MAP/task/lesson，运行显式离线tests/typecheck/lint/build并只读复核；不自动合并PR。

工程入口：`scripts/ci/offline-checks.sh` 在没有本地.env的干净源码快照执行；禁止 `pnpm build`。UI中间材料与截图只存 `.local-review/`。当前品牌 PR #13 尚未合并，本轮沿当前品牌分支继续；不得覆盖其他人的修改。
