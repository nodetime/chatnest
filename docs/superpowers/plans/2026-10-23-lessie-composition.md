# Lessie composition correction — implementation plan

> **For agentic workers:** Use subagent-driven-development, with one implementation owner for this coupled layout surface.

**Goal:** Fulfil the already approved Lessie-inspired composition, not another colour/spacing pass.
**Architecture:** An open generic artifact enters a two-pane focus layout: history is temporarily off-canvas without changing its persisted preference, chat stays about 400 px and the artifact fills the remainder. A single artifact header hosts context-specific controls. Keep existing Agent/tool orchestration and all generic viewers.
**Tech Stack:** Existing Next.js, React, shadcn and react-data-grid.

The prior functional acceptance remains valid; the user rejected its visual acceptance. Compare against the actual saved Lessie reference, not just the last ChatNest screenshot.

- [x] Inspect shell/sidebar/workspace ownership; add focused regression checks for focus/restoration, header composition and responsive widths.
- [x] Implement scoped focus mode on artifact open with explicit sidebar toggle override; preserve stored sidebar preference and restore on close. Chat-only and admin layouts unchanged. Default chat ~400 px, workspace remainder; manual resize still works.
- [x] Consolidate title, artifact picker, table controls and workspace actions into one desktop rail (responsive overflow or menu, no vanished actions). Keep generic text/code/image viewers and unsaved/version guards. Avoid portal/remount state loss.
- [x] Make filter a deliberate compact control, not a permanent second full-width rail. No fabricated matching groups, avatars, selection or unavailable actions. Show actual title/source semantics, retain raw details.
- [x] Root browser comparison at 1440 × 900 and 390 px, filter/notes save/reopen, generic artifact switch; run explicit safe suite, typecheck, scoped lint and isolated production build. No customer files, paid APIs, migrations or broad unit glob.
- [x] Record actual evidence and remaining differences; do not equate test success with visual acceptance.
