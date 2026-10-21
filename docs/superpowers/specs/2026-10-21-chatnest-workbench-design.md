# ChatNest 简洁工作台设计

**状态：** 用户已批准 Manus 式克制工作台方向；本文件仅固化设计，尚未实现 UI，无需重复方向审批。
**基线/分支：** `e56c6b3` → `feat/ui/workbench`。
**工作目录：** `/Users/nako/Documents/ChatGPT/ai-chat/.worktrees/chatnest-mcp-settings`。

## 方向与边界

先看对话结论和右侧结果，再按需看工具过程及技术来源。选用「现有组件 + 局部样式 + 渐进展开」：整套换设计系统会波及 admin，只缩字号则没有解决卡片占位和多层表头。保留 ChatNest 自有名称，不仿 Manus 标识、不新增品牌装饰、sidebar 功能或依赖。

暖灰外壳/紧凑侧栏 + light 白色内容面；dark 映射现有 background/card/sidebar tokens。chat 专属作用域，不改 `:root`、`.dark` 或 admin 全局主题。主要面板12px圆角、8px基础间距、低对比1px边界；桌面工作区约8px留白，移动端全宽，不堆阴影。允许 shell/header/composer 轻量 class 调整；保留现有字体栈，主文15–16px、工具行13px。侧栏仍256px，只收紧纵向空隙，折叠/mobile Sheet不变。

## 六项验收合同

1. **工具轻量化。** 成功工具是32–40px低对比单行：图标/中文动作/文本状态/展开指示，无大框或胶囊堆叠。`loadSkill`说明、搜索来源、输入输出放进展开内容/技术详情，完整会话来源tab保留。审批/错误突出且自动展开；**审批/错误转为成功时自动收起**，之后用户手动展开保持有效，不能每次render都强制收起。审批输入、允许/拒绝、readonly、错误/拒绝/未完成的真实状态不隐藏。未知工具默认「执行工具」，原始name/alias留技术详情，已知中文映射保留。

2. **来源渐进展开。** 表格来源头只有短serverName、**未核验**、「来源详情」。Sheet保留source全部原始字段：serverId/serverName/toolName（alias）/toolCallId/completedAt/timeBasis；时间基准加中文说明但保留原值。长值换行，摘要可截断；Sheet可关闭并返回焦点。原始行Sheet仍按sourceIndex展示完整raw JSON与定位；隐藏列/筛选不删除原始信息或改导出。

3. **紧凑文档附件。** 非图片卡56–64px高：横向图标、文件名、类型/已有大小、真实读取状态；不新增旧`.doc`支持。图片96px预览与鉴权URL不变。历史附件wrap，长名不撑页；390px下草稿移除/失败重试可发现且不依赖hover，保留aria名称和上传中/禁用规则，不给历史只读附件新增编辑能力或虚构metadata。

4. **结果主角。** 保留浏览器/文档/来源tabs及键盘、展开/关闭；tabs下只留一个artifact.title，移除重复「结果表格」大标题和重复embedded关闭入口。筛选/列/CSV/JSON紧凑、手机可换行。空备注默认收起；保存视图与备注独立于折叠体，始终可达，dirty/saving/error/409明确；历史/只读仍禁保存。1280×800桌面默认工作区、备注收起时，**DataGrid可视高度÷工作区可视高度≥50%**。保留min-h-0/min-w-0与SidebarInset溢出修复，允许表格内部横滚，不允许页面横向溢出。

5. **局部RDG主题。** 唯一作用域`.chatnest-result-grid`映射现有light/dark变量；13px字、38px行/表头（容许36–40px），弱纵线、清楚表头与可见焦点轮廓。不覆盖全局`.rdg`，不换库。冻结序号、排序、列宽、行详情、链接、虚拟化保持。

6. **自有中文文案。** 保存/更新/生成/版本/查看更改/恢复/最新等显示文案统一中文；date-fns使用已安装`zhCN` locale。只改标签/tooltip，不改动作发送给Agent的message。**ChatNest、CSV、JSON、供应商原字段名/值、原始工具名、URL、导出内容不翻译**；技术详情保留原始时间和timeBasis。

## 不变量与交付

不新增固定Agent步骤、虚假进度、法律结论或模型调用；不改上传鉴权/原字节/提取、审批协议、证据快照、CAS expectedVersion/冲突、版本、CSV当前视图/防公式注入、JSON完整快照及下载语义。不改DB/API/schema，不引入云上传或生成中resume。

三串行切片：①外壳/工具/附件；②工作区/来源/备注与保存；③RDG/中文状态。每片fresh implementer、先RED后GREEN、独立commit、主会话重新verification及spec/quality双审。仅运行计划显式安全单测、类型、定向Biome/diff；禁止unit全通配、真实.env、pnpm build/迁移、真实DB、浏览器操作、服务重启、付费调用；不触碰live worktree的`.local-review`。

**主会话另行截图验收：** 首页/有消息/右侧表格 × 390/1280/1440宽 × light/dark；桌面1280×800量网格≥50%，1280×720保留旧溢出回归，侧栏开/收均覆盖。检查工具密度、审批转成功收起、附件操作、完整来源、独立保存和布局。静态SSR/class测试不冒充实际交互/几何通过，本文件不授权实现者操作浏览器。
