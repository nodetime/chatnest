# Lessie workbench implementation plan

> Required workflow: subagent-driven-development. One coordinated source writer; root browser acceptance; independent spec then quality review.

**Goal:** Apply the approved whole-workbench visual language while preserving autonomous Agent and generic artifacts.
**Architecture:** Existing React/Next/Tailwind/shadcn and AI Elements presentation only. Result-table draft ownership/CAS stays authoritative; recompose its controls and notes Sheet rather than changing evidence or tools.
**Tech Stack:** Existing Next16, React19, AI SDK7, Radix/shadcn, react-data-grid. No dependency additions.

- [ ] Read map, lesson log, spec and existing focused UI tests. Write failing presentation/lifecycle regressions for new toolbar, notes and conditional save.
- [ ] Update chat-scoped tokens and coordinated shell/sidebar/header/message/input/workspace styling; preserve canonical message/editor identities.
- [ ] Recompose result-table toolbar, source trigger and notes Sheet; remove permanent helper footer; improve row/header/column density; preserve original save, exports, readonly and raw/source details.
- [ ] Adjust existing style assertions intentionally; add behavior tests for note open/edit/close/reopen/save state and no dirty state loss; run explicit focused suites/types/lint.
- [ ] Independent spec then code-quality review, fix findings. Root evaluates actual browser and full fixture flow, not just counts.
- [ ] Root explicit safe full suite, isolated direct build, local primary merge/regression/parity, actual screenshot and concise handoff.

Likely files: app/globals.css; components/chat/{app-sidebar,chat-header,messages,message,multimodal-input,workspace,workspace-header,artifact-picker,activity-group,tool-activity,result-table,result-table-source}.tsx; hooks/use-workspace.ts; focused tests/unit UI suites. A small result-table-notes component is allowed if it keeps parent draft ownership clear. No runtime/provider/schema/DB changes.
