# ChatNest flat general Agent workbench implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Polish the approved Lessie-inspired general Agent presentation without hardcoding tasks or specializing the universal artifact pane.

**Architecture:** Chat-scoped semantic tokens plus existing component structure. No new design framework or Agent/runtime changes. One UI writer, independent read-only reviews, root-owned isolated browser acceptance.

**Tech Stack:** Next.js 16 / React 19 / Tailwind / existing shadcn + AI Elements.

## Chunk 1: Flat shell and hierarchy

Files: app/globals.css; components/chat/{shell,workspace,app-sidebar,chat-header,greeting,multimodal-input,activity-group,tool-activity,artifact,result-table}.tsx; components/ai-elements/tool.tsx if needed. Tests: tests/unit/{workbench-ui,chat-layout,activity-groups,text-editor-lifecycle}.test.ts. Extend only necessary adjacent chat presentation components, no unrelated refactors.

- [ ] Add failing presentation regressions for chat-scoped palette, flat shell/workspace (no md:m-2/inset-2/rounded card), aligned headers, general artifact kinds and neutral generic copy. Preserve existing behavioral assertions and add meaningful structural checks rather than testing arbitrary class ordering.
- [ ] Run explicit UI tests with env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test corepack pnpm exec tsx --conditions=react-server --test tests/unit/workbench-ui.test.ts tests/unit/chat-layout.test.ts tests/unit/activity-groups.test.ts tests/unit/text-editor-lifecycle.test.ts; expect new assertions fail before implementation.
- [ ] Set chat-only surface/ink/muted/border/secondary/sidebar semantic tokens for light/dark. Neutral gentle whites, restrained semantic status colors. Scope dialogs sensibly: portal defaults not globally overridden.
- [ ] Flatten shell/sidebar/workspace without removing min-w-0, overlay/resize/navigation semantics. Use matching 48px headers, small-radius controls, thin dividers and consistent readable typography. Give keyboard resizer visible focus; preserve touch/keyboard target sizes.
- [ ] Refine greeting/composer/tool headers and generic artifact/table internal controls where needed. No fabricated state, fixed task flow, law-specific label or new navigation. Keep source details and exact tool parameters accessible. Tool failure/approval stays discoverable and human controls retain original IDs.
- [ ] Run the explicit UI suite, tsc --noEmit --incremental false and changed-file ultracite. Review own diff for runtime changes, history/undo regressions and mobile overflow; commit scoped implementation.

## Chunk 2: Independent review and browser acceptance

- [ ] Spec reviewer checks actual diff vs approved design and retained behavioral coverage. Writer resolves issues; reviewer rechecks.
- [ ] Code-quality reviewer checks CSS scope, accessibility, React state, artifact immutability and unintended Agent/runtime edits. Writer resolves issues; reviewer rechecks.
- [ ] Root reruns full explicit safe offline suite (never tests/unit/*.test.ts), types, changed-file format and isolated production build. Never pnpm build or production migrations.
- [ ] Root alone restores ignored local mock model/MCP + fixture-auth Next services on 33378/33379/33381 and dedicated PG56508. No real env, provider fees or customer files. CUA browser only; fresh HTTP tab if stale browser error page.
- [ ] Root tests actual UI: empty/new task, upload/read PDF/Word/Excel, dynamic MCP approval and denial, successful general text/table artifact open, saved view/notes after reload, tool errors, text typing/undo. Check 390/1280/1440 light/dark screenshots and no whole-page overflow. Preserve general image/code/sheet registration.
- [ ] Update task/map/verification with actual results, limitations and screenshots; keep private synthetic fixtures ignored. Leave working preview open. Do not claim live provider or cloud/background readiness.
