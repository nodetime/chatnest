# Unified tools implementation plan

> **For agentic workers:** Use subagent-driven-development; one source writer, independent reviews, root verification.

**Goal:** Consistent usable search/MCP/skills/file interactions without changing generic Agent behavior.
**Architecture:** Pure browser-safe projection + small result renderer composed into existing ToolActivity. Keep details and canonical identity owners intact.
**Stack:** Existing TypeScript, React, AI Elements, shadcn/Radix; no packages.

- [x] Add focused red tests for projection and native/dynamic boundaries; inspect actual contracts, avoid guessed schema semantics.
- [x] Implement pure presentation helper and bounded result renderer, adjust ToolActivity and exact special-tool grouping. Keep original primitive values/keys and Sheet evidence.
- [x] Verify running, approval, denied, errors, empty/text/structured outcomes and skill resource rendering. Preserve disclosure and inspector lifetime regressions.
- [x] Independent spec review then quality review; fix findings before acceptance.
- [x] Root extend ignored fixture scenarios only; browser actual skill/resource + HTTP MCP + optional artifact and no-artifact flows, upload/read/save/reopen, keyboard and responsive screenshots.
- [x] Root full safe tests/type/lint/direct isolated build; local main FF only after verification, rerun on main. Update map/lessons/acceptance; no push.
