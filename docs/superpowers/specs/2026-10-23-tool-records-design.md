# Tool records, not nested debug panels

## Problem verified in the real browser

The user points at persisted PDF read UI. Root reproduced the exact page: one read is nested under `执行过程 1 次调用`, then `读取附件文字`, then attachment metrics, native original-text details and native technical details. The result feels like a debugger, not a general Agent assistant. The previous Artifact/Task pass did not address this inner interaction.

Native Codex app UI access was denied by the available computer-use surface; do not bypass that restriction or claim a hands-on Codex session. Public official Codex article/docs were consulted as references, not runtime acceptance. The acceptance target is the actual ChatNest interaction, not an unverifiable parity claim.

## Focused correction

- A single generic tool step is a single action row directly in the conversation, not a one-item execution group. Multi-step activity may retain one group, but calls are steps in UI language. Preserve canonical message order/IDs, attention reopening, user disclosure choices and the general autonomous Agent flow.
- Completed attachment row shows a readable action and actual filename. Running, awaiting approval, denied, stopped/incomplete and failed remain honest distinct states. No promise that the whole file was read if only a page was requested.
- Opening a read shows actual returned source excerpts and exact position references immediately, not another `details` disclosure. Bound the excerpt area; retain warnings/partial-read notice. Unknown/malformed output must not crash or invent a successful read.
- Internal segment counts, character counts, `非指令` trust-boundary wording and raw JSON are removed from the main reading surface only. They remain intact in original tool evidence and a separately opened details Sheet. Runtime untrusted-data boundaries are unchanged.
- All calls rendered by ToolActivity (native attachment/skills, generic MCP and existing fallbacks) get a keyboard-accessible `查看调用详情` action at the row, opening a normal Sheet with exact original tool name, input, output and raw error. No inline native `技术详情` triangles. Existing special weather/document/table artifact renderers remain unchanged. Exact falsey JSON results (`false`, `0`, empty string and `null`) must remain visible as their actual values, not be labeled absent. The Sheet must dismiss/focus-return without touching the right artifact viewer.
- Approval/error bodies remain immediately visible. Approval shows actual canonical tool identity and meaningful input context (unknown args require opening exact details), never claims unknown MCP is harmless. Existing exact approval ids/readonly guards/callbacks remain.
- Keep the existing quiet ChatNest tokens; this is a change in information hierarchy, not a new color/font/framework pass. No deps, Agent prompt/tool choice, MCP params/credentials, DB or artifact editor changes.

## Verification

Red-green tests for both cross-message and mixed-part grouping paths (retain children/message actions/order and singleton-to-multi streaming), singleton vs multi-step composition, exact source evidence/no extra nested summary, malformed returned data, raw data details Sheet (including falsey results, actual keyboard opening/closing/focus return), honest states and unchanged approvals. Root actual browser on user's PDF, real larger DOCX and XLSX reads, keyboard expand/close details, approval/denial/error histories, multi-tool task and normal artifact pane. Root safe explicit suites, types, scoped lint and isolated direct production build; never migration build or all-unit wildcard. Mock fixtures are isolated and identified as mocks.
