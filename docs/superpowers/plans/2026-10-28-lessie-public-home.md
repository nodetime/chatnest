# Lessie式C端首页实施计划

**Goal:** 对齐用户截图的独立全宽首页，使用入口面向普通用户，已有通用工作台不重造。
**Architecture:** HomeEntry分流官网与/chat，保留旧个人section；公开首页规则不扩大API权限。私有草稿交接只填原有编辑器，不自动执行。样式与示例局限于landing组件。
**Tech Stack:** Next.js16、React19、shadcn Button/Sheet、原始BrandMark、局部CSS。

- [x] 首页/认证/草稿/路由/CSS断言先红后绿；显式离线清单仅追加首页测试文件。
- [x] HomeEntry、/chat、proxy精确公开首页、新对话与个人回跳规范；空对话跨旧个人section不重置身份。
- [x] Lessie式光晕、导航、衬线标题、CTA/输入、紧凑结果预览；去说明矩阵/大片淡出，开发者入口降到页脚。
- [x] 草稿owner/TTL/有界/一次性消费/不进URL；保留既有草稿，无第二条自动发送路径。
- [x] 修复浏览器发现的缓存登录/注册表单重复id：SSR回归先红后绿，保持认证服务不变。
- [x] 更新CODEBASE_MAP/task/lesson，隔离浏览器1440/390、入口/菜单/详情/草稿及原通用Agent链路回归。
- [x] 主会话干净源码完整白名单/typecheck/lint/无迁移build，只读审查；正常预览核对后提交PR，不自动合并。

范围边界：未改Porta/模型/Agent调度；页面示例不写入真实聊天、证据或资料库。中间材料、截图与配置均在忽略目录。当前干净checkout新分支实现，复用现有组件，不另开重复服务架构。
