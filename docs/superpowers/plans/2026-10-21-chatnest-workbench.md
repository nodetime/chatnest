# ChatNest 简洁工作台实现计划

> **面向 Agent 执行者：** 必须使用 superpowers:subagent-driven-development（若子 Agent 可用）或 superpowers:executing-plans 实现此计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 落地已批准的暖灰/白色、结果优先、技术信息渐进展开工作台，不改变既有业务语义。
**架构：** 复用聊天外壳、Tool/Collapsible、Sheet、PreviewAttachment、Workspace/Artifact、RDG；局部 class 与必要小展示组件，三个串行切片，每片由全新实现者负责，主会话独立重新验证 + 规格/质量双审后派下一片。
**技术栈：** Next.js16 / React19 / Tailwind4 / Radix / react-data-grid7 / date-fns zhCN / tsx+node:test。

---

## 上下文与验证护栏

工作目录 `/Users/nako/Documents/ChatGPT/ai-chat/.worktrees/chatnest-mcp-settings`；基线`e56c6b3`，分支`feat/ui/workbench`。以下路径相对该固定目录；先读`docs/CODEBASE_MAP.md`和`docs/superpowers/specs/2026-10-21-chatnest-workbench-design.md`。方向已获用户批准，不重复请求技术文档审批。实施遵循 @test-driven-development / @systematic-debugging / @verification-before-completion。

**禁止：** 单元测试全通配或排除式猜测安全文件；真实 .env；pnpm build/迁移、真实数据库、浏览器操作/重启服务、付费调用；改`.local-review`、Porta、依赖、配置密钥或管理后台全局主题。特别不运行 regeneration-db（加载真实环境）和 browser-runtime。仅本计划新增`tests/unit/workbench-ui.test.ts`加入下列白名单；不改动业务断言来迁就样式。

**每片通过后统一命令：** 从工作目录执行；花括号展开是明确枚举文件，不是通配。基线169测试，新增后总数增加，要求 fail=0。

```bash
pnpm exec tsx --conditions=react-server --test \
 tests/unit/{branding,admin-template,platform-admin-separation,private-uploads,openai-inline-images,porta,porta-errors,agent,message-turn,model-connection,browser,task-experience,document-ingestion,result-table,chat-layout,ai-telemetry,workbench-ui}.test.ts \
 tests/unit/mcp-settings-{api,build,editor,general-ui,lifecycle,runtime,security,service}.test.ts
pnpm exec tsc --noEmit --incremental false
git diff --check
```

`mcp-settings-build`是既有离线测试，不执行应用构建。Biome仅传该片明确变更文件；不要改配置扩大格式化范围，既有`components/ui`和`components/ai-elements`为排除目录。

## 阶段 1：外壳、工具、文档密度

**修改：** `app/(chat)/layout.tsx`、`app/globals.css`、`components/chat/{shell,chat-header,app-sidebar,multimodal-input,tool-activity,preview-attachment,message}.tsx`、`components/ai-elements/tool.tsx`。
**新增：** `tests/unit/workbench-ui.test.ts`。

- [ ] **失败测试。** 用合成 props/SWR 回退数据及 SSR 子进程（NODE_OPTIONS 清空）测成功 loadSkill/search、未知工具、审批、错误、拒绝；检查成功无外置说明/来源，未知主标题中文、原名详情可查。补「approval-requested/output-error->output-available 自动收起，而成功后手动展开保持」的状态转移回归；审批输入/允许拒绝/只读状态不丢。附件测文档紧凑类、图片96px/鉴权URL不变、移除/重试 aria、历史换行。执行`pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts`，确认因当前行为缺口失败，不以导入错误代替失败阶段。
- [ ] **最小展示实现。** SidebarProvider 加聊天专属作用域；暖灰外壳浅色 `#f4f3ef`、深色映射 sidebar，白色/浅色或 card/深色内容面、12px圆角/8px间距/1px边界，桌面工作区留白、移动全宽。只压侧栏纵向间距，保留256px/功能/字体/SidebarInset min-w-0。现有 ToolHeader 加可选紧凑外观（默认不变）：36px/13px、文本状态不用 Badge；成功无大框，说明/来源移进 ToolContent。用上一次工具 state 识别**进入成功**时收起，不在后续同 state 渲染时反复关闭用户展开；审批/错误仍自动展开。
- [ ] **附件实现。** 只给非图片分支56–64px横向布局；文档动作持续可见，文字预留按钮空间，历史容器 flex-wrap。图片、extractionLabels、真实状态/URL、上传遮罩/重试/移除处理和输入区隐藏 input/ref 不改。
- [ ] **通过验证。** 跑统一安全清单/tsc/差异检查；对本片明确文件`pnpm exec biome check <该片实际变更文件>`，预期全通过。不运行浏览器；记录 SSR 不能验证的实际高度/状态交互，交主会话独立验收。
- [ ] **提交与停点。** 仅暂存本片文件，提交 `feat(ui): simplify chat workbench activity and attachment surfaces`；回报 SHA、失败/通过结果、待验收项，等待主会话双审后再派下一片。

## 阶段 2：工作区、完整来源、独立保存

**修改：** `components/chat/{workspace,artifact,result-table}.tsx`、`tests/unit/workbench-ui.test.ts`。
**新增：** `components/chat/result-table-source.tsx`（来源摘要+Sheet纯展示，不查服务）。

- [ ] **失败测试。** 扩展测试夹具回归：来源摘要只有 serverName/未核验/来源详情；详情保留 source 全部六字段及原值，行详情仍按 sourceIndex 显示原始数据。空备注收起，保存动作在备注折叠体之外；筛选/排序标记为未保存，只读/历史禁保存；保留标签页与单个 artifact.title。运行`pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts tests/unit/result-table.test.ts`并记录预期失败；新模块用动态 import+assert 形成明确缺口，不以导入崩溃代替失败阶段。
- [ ] **层级与来源。** 标签页保留，嵌入的 Artifact 只留紧凑文档标题，不重复文档关闭入口（独立模式保留）；ResultTable 去重复大标题，保留行数/只读提示。新`ResultTableSource({source}: {source: ResultSource})`以短摘要开 Sheet，完整 serverId/serverName/toolName/toolCallId/completedAt/timeBasis 原值及中文基准说明可查；保留原始行 Sheet、Radix 焦点行为、超长值滚动/换行。
- [ ] **保存与高度。** 紧凑筛选/列/CSV/JSON可换行；个人备注以`useState(Boolean(table.notes))`设初始展开状态，用户可主动收起。保存/未保存/保存中/错误放在折叠体之外。原 save 函数及 documentId/expectedVersion/409/readOnly/saving/onSaved 语义不动。补 flex/min-h-0/min-w-0 链，让 DataGrid 吃剩余空间；非表格编辑器仍可滚动。1280×800默认备注收起网格≥50%，不得靠藏按钮达标。
- [ ] **通过验证。** 跑统一安全清单/tsc/差异检查；定向 Biome 检查本片明确文件；确认 API/信封/CAS/CSV/JSON 实现无差异。静态测试只验证契约，实际高度和操作留主会话验收。
- [ ] **提交与停点。** 提交 `feat(ui): prioritize result workspace and progressive provenance`，仅暂存本片；主会话独立重新验证和双审后再派第三片。

## 阶段 3：局部RDG、中文生命周期

**修改：** `app/globals.css`、`components/chat/{result-table,artifact,version-footer}.tsx`、`artifacts/{text,code,sheet,image}/client.tsx`、`tests/unit/workbench-ui.test.ts`。

- [x] **失败测试。** 断言自有保存/更新/生成/版本/页脚/动作提示中文，formatDistance 带 zhCN，供应商字段/ChatNest/CSV/JSON不变；网格限定作用域的 class、13px、38px行/表头。运行`pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts tests/unit/result-table.test.ts tests/unit/branding.test.ts`，观察当前英文和缺少局部设计令牌导致失败。
- [x] **RDG实现。** DataGrid追加`.chatnest-result-grid`且保留rdg-dark/light；`rowHeight={38}`/`headerRowHeight={38}`，去掉旧内联 fontSize12。仅该 class 映射`--rdg-color→--foreground`、`--rdg-background-color→--card`、`--rdg-header-background-color→--secondary`、hover/selected->--accent、border->--border（可65%透明混合）、selection->--ring、font-size13px；局部 gridcell 弱化纵边，表头分界/焦点轮廓保留。不碰其他RDG/全局管理后台/排序虚拟化。
- [x] **中文实现。** `import { zhCN } from "date-fns/locale"`；更新时间`formatDistance(date, now, {addSuffix:true,locale:zhCN})`配「更新于」。使用「正在保存…/正在生成…/第N/M版/上一版本/下一版本/查看更改/恢复此版本/最新版本」。只改自有可见标签/说明，不改版本索引、恢复保护、工具栏发给 Agent 的消息、原始字段或下载内容。
- [x] **通过验证。** 统一安全清单/tsc/差异检查、对本片明确文件定向 Biome；确认无新依赖/后端/API/配置/遥测变动，所有既有业务测试保留。
- [x] **提交与交付。** 提交 `feat(ui): align result grid tokens and Chinese lifecycle labels`；向主会话提供三 SHA/验证输出/待截图合同，不启动浏览器。

## 主会话最终验收合同（另行安排，非实现者浏览器操作步骤）

- [ ] 截图：首页/有消息/右侧表格 × 390/1280/1440宽 × 浅色/深色；桌面1280×800量网格÷工作区高度≥0.5，1280×720旧溢出回归，侧栏展开/收起均无页面横溢。
- [ ] 成功32–40px且审批完成自动收起/手动可展开；审批错误不藏；文档56–64px、图片96px、390动作可达；标签页+单标题；完整来源/原始数据详情、独立保存、未保存/409、只读/历史及CSV当前视图/JSON完整快照不变。
- [ ] 主仓重新运行显式安全清单、类型、定向检查，规格/质量双审后整合。真实截图/几何/交互证据不由SSR或工作者退出0替代。
