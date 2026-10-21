# ChatNest 简洁工作台 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地已批准的暖灰/白色、结果优先、技术信息渐进展开工作台，不改变既有业务语义。
**Architecture:** 复用chat shell、Tool/Collapsible、Sheet、PreviewAttachment、Workspace/Artifact、RDG；局部class与必要小展示组件，三个串行切片，每片fresh implementer，主会话fresh verification + spec/quality双审后派下一片。
**Tech Stack:** Next.js16 / React19 / Tailwind4 / Radix / react-data-grid7 / date-fns zhCN / tsx+node:test。

---

## 上下文与验证护栏

工作目录 `/Users/nako/Documents/ChatGPT/ai-chat/.worktrees/chatnest-mcp-settings`；基线`e56c6b3`，分支`feat/ui/workbench`。以下路径相对该固定目录；先读`docs/CODEBASE_MAP.md`和`docs/superpowers/specs/2026-10-21-chatnest-workbench-design.md`。方向已获用户批准，不重复请求技术文档审批。实施遵循 @test-driven-development / @systematic-debugging / @verification-before-completion。

**禁止：** unit全通配或排除式猜测安全文件；真实.env；pnpm build/迁移、真实DB、浏览器操作/重启服务、付费调用；改`.local-review`、Porta、依赖、配置密钥或admin全局主题。特别不运行regeneration-db（加载真实环境）和browser-runtime。仅本计划新增`tests/unit/workbench-ui.test.ts`加入下列白名单；不改动业务断言来迁就样式。

**每片GREEN后统一命令：** 从工作目录执行；brace expansion是明确枚举文件，不是通配。基线169测试，新增后总数增加，要求fail=0。

```bash
pnpm exec tsx --conditions=react-server --test \
 tests/unit/{branding,admin-template,platform-admin-separation,private-uploads,openai-inline-images,porta,porta-errors,agent,message-turn,model-connection,browser,task-experience,document-ingestion,result-table,chat-layout,ai-telemetry,workbench-ui}.test.ts \
 tests/unit/mcp-settings-{api,build,editor,general-ui,lifecycle,runtime,security,service}.test.ts
pnpm exec tsc --noEmit --incremental false
git diff --check
```

`mcp-settings-build`是既有离线测试，不执行应用build。Biome仅传该片明确变更文件；不要改配置扩大格式化范围，既有`components/ui`和`components/ai-elements`为排除目录。

## Chunk 1：外壳、工具、文档密度

**Modify：** `app/(chat)/layout.tsx`、`app/globals.css`、`components/chat/{shell,chat-header,app-sidebar,multimodal-input,tool-activity,preview-attachment,message}.tsx`、`components/ai-elements/tool.tsx`。
**Create：** `tests/unit/workbench-ui.test.ts`。

- [ ] **RED测试。** 用合成props/SWR fallback及SSR子进程（NODE_OPTIONS清空）测成功loadSkill/search、未知工具、审批、错误、拒绝；检查成功无外置说明/来源，未知主标题中文、原名详情可查。补「approval-requested/output-error→output-available自动收起，而成功后手动展开保持」的状态转移回归；审批输入/允许拒绝/readonly不丢。附件测文档紧凑类、图片96px/鉴权URL不变、移除/重试aria、历史wrap。执行`pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts`，确认因当前行为缺口失败，不以导入错误代替RED。
- [ ] **最小展示实现。** SidebarProvider加chat专属作用域；暖灰外壳light `#f4f3ef`、dark映射sidebar，白/light或card/dark内容面、12px圆角/8px间距/1px边界，桌面工作区留白、移动全宽。只压sidebar纵向间距，保留256px/功能/字体/SidebarInset min-w-0。现有ToolHeader加可选compact外观（默认不变）：36px/13px、文本状态非Badge；成功无大框，说明/来源移进ToolContent。用上一次工具state识别**进入成功**时收起，不在后续同state render反复关闭用户展开；审批/错误仍自动展开。
- [ ] **附件实现。** 只给非图片分支56–64px横向布局；文档动作持续可见，文字预留按钮空间，历史容器flex-wrap。图片、extractionLabels、真实状态/URL、上传遮罩/重试/移除处理和composer hidden input/ref不改。
- [ ] **GREEN。** 跑统一安全清单/tsc/diff；对本片明确文件`pnpm exec biome check <该片实际变更文件>`，预期全通过。不运行浏览器；记录SSR不能验证的实际高度/状态交互，交主会话独立验收。
- [ ] **提交与停点。** 仅stage本片文件，commit `feat(ui): simplify chat workbench activity and attachment surfaces`；回报SHA、RED/GREEN、待验收项，等待主会话双审后再派下一片。

## Chunk 2：工作区、完整来源、独立保存

**Modify：** `components/chat/{workspace,artifact,result-table}.tsx`、`tests/unit/workbench-ui.test.ts`。
**Create：** `components/chat/result-table-source.tsx`（来源摘要+Sheet纯展示，不查服务）。

- [ ] **RED测试。** 扩展fixture回归：来源摘要只有serverName/未核验/来源详情；详情保留source全部六字段及原值，行详情仍按sourceIndex显示raw。空备注收起，保存动作在备注折叠体之外；filter/sort dirty、readonly/history禁保存；保留tabs与单个artifact.title。运行`pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts tests/unit/result-table.test.ts`并记录预期失败；新模块用动态import+assert形成明确缺口，不以导入崩溃代替RED。
- [ ] **层级与来源。** tabs保留，embedded Artifact只留紧凑文档标题，不重复文档关闭入口（standalone保留）；ResultTable去重复大标题，保留行数/只读提示。新`ResultTableSource({source}: {source: ResultSource})`以短摘要开Sheet，完整serverId/serverName/toolName/toolCallId/completedAt/timeBasis原值及中文基准说明可查；保留原始行Sheet、Radix焦点行为、超长值滚动/换行。
- [ ] **保存与高度。** 紧凑筛选/列/CSV/JSON可换行；个人备注以`useState(Boolean(table.notes))`设初始展开状态，用户可主动收起。保存/dirty/saving/error放在折叠体之外。原save函数及documentId/expectedVersion/409/readOnly/saving/onSaved语义不动。补flex/min-h-0/min-w-0链，让DataGrid吃剩余空间；非表格编辑器仍可滚动。1280×800默认备注收起网格≥50%，不得靠藏按钮达标。
- [ ] **GREEN。** 跑统一安全清单/tsc/diff；定向Biome检查本片明确文件；确认API/envelope/CAS/CSV/JSON实现无diff。静态测试只验证契约，实际高度和操作留主会话验收。
- [ ] **提交与停点。** commit `feat(ui): prioritize result workspace and progressive provenance`，仅stage本片；主会话fresh verification和双审后再派第三片。

## Chunk 3：局部RDG、中文生命周期

**Modify：** `app/globals.css`、`components/chat/{result-table,artifact,version-footer}.tsx`、`artifacts/{text,code,sheet,image}/client.tsx`、`tests/unit/workbench-ui.test.ts`。

- [x] **RED测试。** 断言自有保存/更新/生成/版本/footer/动作tooltip中文，formatDistance带zhCN，供应商字段/ChatNest/CSV/JSON不变；网格scoped class、13px、38px行/表头。运行`pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts tests/unit/result-table.test.ts tests/unit/branding.test.ts`，观察当前英文和缺少局部tokens导致失败。
- [x] **RDG实现。** DataGrid追加`.chatnest-result-grid`且保留rdg-dark/light；`rowHeight={38}`/`headerRowHeight={38}`，去掉旧inline fontSize12。仅该class映射`--rdg-color→--foreground`、`--rdg-background-color→--card`、`--rdg-header-background-color→--secondary`、hover/selected→--accent、border→--border（可65%透明混合）、selection→--ring、font-size13px；局部gridcell弱化纵边，表头分界/焦点outline保留。不碰其他RDG/全局admin/排序虚拟化。
- [x] **中文实现。** `import { zhCN } from "date-fns/locale"`；更新时间`formatDistance(date, now, {addSuffix:true,locale:zhCN})`配「更新于」。使用「正在保存…/正在生成…/第N/M版/上一版本/下一版本/查看更改/恢复此版本/最新版本」。只改自有可见标签/description，不改版本索引、restore保护、toolbar发给Agent的message、原始字段或下载内容。
- [x] **GREEN。** 统一安全清单/tsc/diff、对本片明确文件定向Biome；确认无新依赖/后端/API/配置/遥测变动，所有既有业务测试保留。
- [x] **提交与交付。** commit `feat(ui): align result grid tokens and Chinese lifecycle labels`；向主会话提供三SHA/验证输出/待截图合同，不启动浏览器。

## 主会话最终验收合同（另行安排，非实现者浏览器操作步骤）

- [ ] 截图：首页/有消息/右侧表格 × 390/1280/1440宽 × light/dark；桌面1280×800量网格÷工作区高度≥0.5，1280×720旧溢出回归，侧栏展开/收起均无页面横溢。
- [ ] 成功32–40px且审批完成自动收起/手动可展开；审批错误不藏；文档56–64px、图片96px、390动作可达；tabs+单标题；完整source/raw详情、独立保存、dirty/409、readonly/history及CSV当前视图/JSON完整快照不变。
- [ ] 主仓重新运行显式安全清单、类型、定向检查，spec/quality双审后整合。真实截图/几何/交互证据不由SSR或worker退出0替代。
