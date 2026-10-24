# ChatNest flat general Agent workbench implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Polish the approved Lessie-inspired general Agent presentation without hardcoding tasks or specializing the universal artifact pane.

**Architecture:** Chat-scoped semantic tokens plus existing component structure. No new design framework or Agent/runtime changes. One UI writer, independent read-only reviews, root-owned isolated browser acceptance.

**Tech Stack:** Next.js 16 / React 19 / Tailwind / existing shadcn + AI Elements.

Spec/plan review: approved by independent read-only reviewer; no blockers. Baseline explicit UI tests: 58/58.

## Chunk 1: Flat shell and hierarchy

Files: app/globals.css; components/chat/{shell,workspace,app-sidebar,chat-header,greeting,multimodal-input,activity-group,tool-activity,artifact,result-table}.tsx; components/ai-elements/tool.tsx if needed. Tests: tests/unit/{workbench-ui,chat-layout,activity-groups,text-editor-lifecycle}.test.ts. Extend only necessary adjacent chat presentation components, no unrelated refactors.

- [x] Add failing presentation regressions for chat-scoped palette, flat shell/workspace (no md:m-2/inset-2/rounded card), aligned headers, general artifact kinds and neutral generic copy. Preserve existing behavioral assertions and add meaningful structural checks rather than testing arbitrary class ordering.
- [x] Run explicit UI tests with env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test corepack pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts tests/unit/chat-layout.test.ts tests/unit/activity-groups.test.ts tests/unit/text-editor-lifecycle.test.ts; expect new assertions fail before implementation.
- [x] Set chat-only surface/ink/muted/border/secondary/sidebar semantic tokens for light/dark. Neutral gentle whites, restrained semantic status colors. Scope dialogs sensibly: portal defaults not globally overridden.
- [x] Flatten shell/sidebar/workspace without removing min-w-0, overlay/resize/navigation semantics. Use matching 48px headers, small-radius controls, thin dividers and consistent readable typography. Give keyboard resizer visible focus; preserve touch/keyboard target sizes.
- [x] Refine greeting/composer/tool headers and generic artifact/table internal controls where needed. No fabricated state, fixed task flow, law-specific label or new navigation. Keep source details and exact tool parameters accessible. Tool failure/approval stays discoverable and human controls retain original IDs.
- [x] Run the explicit UI suite, tsc --noEmit --incremental false and changed-file ultracite. Review own diff for runtime changes, history/undo regressions and mobile overflow; commit scoped implementation.

## Chunk 2: Independent review and browser acceptance

- [x] Spec reviewer checks actual diff vs approved design and retained behavioral coverage. Writer resolves issues; reviewer rechecks.
- [x] Code-quality reviewer checks CSS scope, accessibility, React state, artifact immutability and unintended Agent/runtime edits. Writer resolves issues; reviewer rechecks.
- [x] Root reruns full explicit safe offline suite (never tests/unit/*.test.ts), types, changed-file format and isolated production build. Never pnpm build or production migrations.
- [x] Root alone restores ignored local mock model/MCP + fixture-auth Next services on 33378/33379/33381 and dedicated PG56508. No real env, provider fees or customer files. CUA browser only; fresh HTTP tab if stale browser error page.
- [x] Root tests actual UI: empty/new task, upload/read PDF/Word/Excel, dynamic MCP approval and denial, successful general text/table artifact open, saved view/notes after reload, tool errors, text typing/undo. Check 390/1280/1440 light/dark screenshots and no whole-page overflow. Preserve general image/code/sheet registration.
- [x] Update task/map/verification with actual results, limitations and screenshots; keep private synthetic fixtures ignored. Leave working preview open. Do not claim live provider or cloud/background readiness.

### Browser feedback follow-up

Files may also include components/chat/{document-preview,toolbar}.tsx and chat-scoped sidebar-width provider style. User's current live page rejected oversized duplicate inline preview and random vertical floating toolbar. Add tests for bounded compact generic previews and header-contained assist actions; preserve all actions, document opening, readonly guards and evidence protections. Refine readable title hierarchy and224px desktop navigation without affecting admin/mobile. Root re-verifies actual text/code/image/sheet artifacts, not only table. Keep same source writer; spec+quality reviewers include this addendum.

Final source: 40824f1. Root verified233/233 explicit safe units, typecheck,16-file formatting and isolated production build. Independent spec/quality approved; browser feedback led to actual-component lifecycle regression and full-height splitter correction, not source-regex-only acceptance. Production browser opened artifacts, reopened same card, keyboard-resized and loaded persisted table without console errors.
