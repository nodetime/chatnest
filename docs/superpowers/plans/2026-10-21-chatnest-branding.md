# ChatNest 显示名称一致性

已批准范围：面向客户的 UI、标题、管理后台和对话导出使用 ChatNest。Porta 必须逐字节保持不变。这是一个相互关联的品牌变更，不是并行模块开发。

1. 为根页面标题（ChatNest）、管理后台标题（ChatNest Admin）、首页标签、管理身份，以及对话 Markdown/下载文件名添加失败的离线回归。保留内容/来源链接，并验证 Porta 配置不变。
2. 在 app/layout.tsx、app/admin/layout.tsx、components/chat/app-sidebar.tsx、components/admin/admin-shell.tsx、components/chat/conversation-sources.tsx 和 lib/agent/conversation-sources.ts 中替换旧产品标签。更新当前 DEVELOPMENT.md 品牌名称及受影响的视觉测试定位器。不重命名内部浏览器全局变量/临时路径、模型标识、第三方文本、历史计划或用户消息内容。不进行迁移或无关功能变更。
3. 运行定向测试、现有 109 项测试安全套件、tsc、定向 Biome 和差异检查。主会话在真实本地预览中独立验证首页/管理后台标题与标签，以及真实对话导出文件名/内容。不进行真实模型/供应商调用，不使用私有材料。先规格审查，再质量审查；仅在验证后本地提交。将主检出目录同步到已验证提交，并在那里重新运行测试。

## 已完成验证

- 五项新增品牌回归和现有管理外壳 SSR 断言在最小实现前观察到失败，随后通过。实现者和主会话分别独立通过全部 114 项安全离线测试、`tsc --noEmit --incremental false`、八个源代码/测试文件的定向 Biome 检查及 `git diff --check`；两个更新后的 Python 视觉定位器也通过语法检查。
- 主会话验证了真实本地首页标题 `ChatNest` 和 `ChatNest 首页` 按钮，以及管理存储页面标题 `ChatNest Admin` 和侧栏身份 `ChatNest / Admin`。真实 UI 导出下载了 `chatnest-82c10dae.md`，包含 `# ChatNest 对话记录`，并保留测试夹具中的用户/助手消息。浏览器证据和截图仍在 `.local-review/` 下被忽略。
- Porta 配置无差异，其 SHA-256 保持为 `1b013f736cd27dba18a209d071c831bf82c2a634ac3fb1692b619535d69e979e`。内部浏览器前缀、模型标识、第三方内容和历史计划保持不变。未引入迁移/构建包装命令、真实供应商/模型请求或无关变更。
- 规格审查批准；质量审查批准且未发现问题。主检出目录同步和验证仍是主会话最终集成步骤。
