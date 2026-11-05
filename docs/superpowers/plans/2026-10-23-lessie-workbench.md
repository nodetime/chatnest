# Lessie 工作台实施计划

> 必需工作流：subagent-driven-development。一名统一协调的源码修改者；主代理负责浏览器验收；依次进行独立规格审查和质量审查。

**目标：** 应用已获认可的整套工作台视觉语言，同时保留自主 Agent 和通用产物。
**架构：** 仅修改现有 React/Next/Tailwind/shadcn 和 AI Elements 展示层。结果表草稿归属/CAS 仍为权威；重新组合其控件和备注 Sheet，不改变证据或工具。
**技术栈：** 现有 Next16、React19、AI SDK7、Radix/shadcn、react-data-grid。不新增依赖。

- [x] 阅读地图、教训日志、规格和现有定向 UI 测试。为新工具栏、备注和条件保存编写失败的展示/生命周期回归测试。
- [x] 更新限定于聊天范围的设计变量，并统一外壳/侧栏/标题栏/消息/输入/工作区样式；保留消息/编辑器的权威标识。
- [x] 重新组合结果表工具栏、来源触发控件和备注 Sheet；移除永久辅助页脚；改进行/标题栏/列密度；保留原有保存、导出、只读及原始/来源详情。
- [x] 有意调整现有样式断言；为备注打开/编辑/关闭/重新打开/保存状态及未保存状态不丢失添加行为测试；运行明确列出的定向套件/类型检查/lint。
- [x] 依次进行独立规格审查和代码质量审查，修复发现的问题。主代理评估实际浏览器和完整测试夹具流程，不仅看测试数量。
- [x] 主代理运行明确列出的完整安全套件、隔离直接构建、本地主检出目录合并/回归/一致性检查，保留实际截图并简要交接。

可能涉及的文件：app/globals.css；components/chat/{app-sidebar,chat-header,messages,message,multimodal-input,workspace,workspace-header,artifact-picker,activity-group,tool-activity,result-table,result-table-source}.tsx；hooks/use-workspace.ts；tests/unit 中的定向 UI 套件。若能保持父组件草稿归属清晰，允许添加一个小型 result-table-notes 组件。不修改运行时/供应商/schema/DB。
