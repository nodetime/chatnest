# Artifact interactions implementation verification

## Scope

Presentation-only execution grouping and the conventional multi-type artifact viewer. Original SDK messages, call/approval IDs, actions, tool execution, evidence envelopes, CAS persistence and renderer kinds remain unchanged. The successful table tool still renders the existing artifact preview, with the actual title and a `表格` type label; its in-flight/error activity uses `生成表格产物`.

## Observed TDD

- Initial feature RED: 7 failures (missing grouping/type-label components, saved-notes disclosure, renamed workspace tab, and relocated version navigation). Existing behavioral tests otherwise passed.
- Header-action RED: the new accessibility/single-navigation regression failed before moving existing actions into the header and naming the buttons.
- Honest idle-status RED: idle unfinished calls and approved-without-output calls failed before the summary/child shared display-state refinement. Idle calls now show `未完成`, not a continuing execution spinner; denied approval keeps its own status; streaming approved calls remain active.
- Real SDK sequence RED: empty SDK text and known transport metadata split attachment-read/search into separate groups. The regression now asserts one two-call group, followed by the table artifact and final answer, with canonical references unchanged. Only empty/whitespace text and explicitly recognized nonvisual step/MCP/title/table transport parts are skipped for presentation.
- Final GREEN: **70 tests passed, 0 failed** in the explicit five-file suite below.

## Commands run in the implementation worktree

```sh
env -i HOME="$HOME" PATH="$PATH" NODE_ENV=test pnpm exec tsx --conditions=react-server --test tests/unit/activity-groups.test.ts tests/unit/workbench-ui.test.ts tests/unit/message-turn.test.ts tests/unit/result-table.test.ts tests/unit/chat-layout.test.ts
env -i HOME="$HOME" PATH="$PATH" pnpm exec tsc --noEmit --incremental false
```

Type checking completed successfully with no diagnostics. Targeted Biome checks/formatting were run on changed TypeScript files; the excluded AI Elements file was formatted through an allowed temporary stdin path. `git diff --check` was also run.

No real environment files, provider calls, migrations, broad unit-test glob, dev-server restart or `pnpm build` were used by the implementation worker. The parent session owns browser/mock HTTP MCP checks and independent main-worktree verification.

## Self-review

- Grouping preserves visible boundaries, special renderers, original references and per-message actions; new attention is keyed by call/state/approval ID, not just aggregate status.
- Parent/child chevrons use their own disclosure state; tool query context stays adjacent to the natural-width child header.
- Text/code/image/sheet labels and renderer selection remain generic. Version navigation appears only in the footer; generic actions keep their existing handlers with accessible names.
- Table controls remain local to the table artifact: current-view CSV, original JSON, source/raw row details, read-only originals, notes/view save and optimistic CAS behavior are retained.

## Acceptance/review follow-up

The parent browser pass exposed text-editor lifecycle loss on every content change. A focused isolated hook/ProseMirror-boundary harness observed **3 RED failures** before the repair: local edits recreated/destroyed the view, readonly updates lost their guard, and equal-content status changes were skipped by memoization. The repair mounts once from the initial content, reconciles later content (including empty strings) through internal `no-save` transactions, retains guards for user edits, and compares status in memoization. Suggestions/schema behavior is unchanged.

Spec review also produced **2 RED failures** before fixes: replacement approval IDs on the same call did not reopen child details, and noncontiguous reasoning was globally merged ahead of intervening tools. Child disclosure now uses call/state/approval identity and individual reasoning SDK parts render at their original positions.

The final explicit suite includes `tests/unit/text-editor-lifecycle.test.ts` in addition to the five files above: **75 passed, 0 failed**. Type checking and targeted Biome checks completed successfully with no diagnostics. The VM harness tests actual component scheduling/transaction logic but replaces its hook scheduler and ProseMirror DOM boundary; actual focus/continuous typing remains a separate parent browser acceptance check.

Final honest-error review: the known native `tool-createResultTable` contract returns `{ error: string }` inside SDK `output-available` on source/validation failures. A precise SSR test observed RED before projecting that specific contract to failed/open activity with its returned error. A negative test confirms dynamic/MCP `output.error` fields (including a dynamic tool with the same name) remain evidence, not normalized failures. Canonical parts/output are unchanged. Final six-file suite: **77 passed, 0 failed**; type checking, targeted Biome and diff checks clean. Parent separately confirmed the actual SDK error envelope in the browser shows failure/error text without an artifact.

Undo-history isolation review: the stable editor revealed that external/streamed replacement transactions previously entered ProseMirror history. The parent reproduced A→B artifact switching followed by Cmd-Z mutating B. Two new RED assertions reproduced missing `addToHistory: false` and missing document/version editor identity. Text editor mounts are now keyed by document/version (inline previews by document/timestamp), not content or typing; external, readonly, empty and streamed replacements are `no-save` and nonhistorical, while ordinary local edits keep their in-document undo behavior. The focused harness now covers six lifecycle/history cases. Final six-file suite: **80 passed, 0 failed**; type checking, targeted Biome and diff checks clean.

Empty-editor acceptance follow-up: the actual empty ProseMirror host collapsed to zero width inside its flex renderer. A focused width-contract regression failed RED before adding only `min-w-0 w-full` to the existing editor host. Final explicit suite: **81 passed, 0 failed**; type checking, targeted Biome and diff checks clean.

## 主会话最终验证（实现提交 42c64b4）

- 主仓 main 重新运行显式安全套件：223/223，通过；类型检查无诊断；21 个改动 TS/TSX 文件定向格式检查通过。
- 隔离源码副本直接 Next webpack production build 成功；未执行迁移或读取真实环境。300 个运行时代码/配置文件与主仓、预览工作树哈希一致。
- 实际浏览器 mock 模型 + HTTP MCP：审批成功、拒绝零 MCP 调用、数据源失败、原生表格生成错误；原会话真实 SDK 空文本/元数据下两个工具归为一组。
- 表格实测筛选、数值排序、隐藏列、折叠备注保存、版本只读、来源完整字段/焦点返回、原始行、刷新重开、CSV 当前两行及公式转义、JSON 三行原始快照。
- 普通文档实测复制、连续中文输入/焦点保持、只读预览、自动保存/刷新重开；合成双文档切换后的撤销不再改变加载内容，正常编辑撤销仍有效；空编辑器宽度从 0 修正为可操作宽度。
- 表格 390/1280/1440 宽度 × 明暗六种布局，文本 390/1440 两种布局无页面横向溢出；键盘过程展开及工作区切换有效。
- 生产构建实际浏览器复验：两工具一组、表格保存状态和备注折叠、普通文档切换/撤销隔离通过，无浏览器 error 日志；临时生产 QA 服务已关闭。
- 未验：付费供应商/真实大模型、云部署；当前本地验证使用隔离 mock 服务。视觉实现不等同于用户已认可效果。
