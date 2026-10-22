# Artifact Interactions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Deliver cohesive tool activity and a standard multi-type artifact viewer, keeping table-specific features within table artifacts.

**Architecture:** Pure presentation projections group adjacent generic tool activities without rewriting canonical messages. Existing artifact types, optional createResultTable and immutable evidence/CAS remain intact. One writer handles coupled UI surfaces serially; independent reviewers remain read-only.

**Tech Stack:** Next.js, React, AI SDK UI parts, existing shadcn/Radix/Tailwind, react-data-grid.

## Chunk 1: Activity and artifact presentation

### Task 1: Tool activity grouping

Files: new focused presentation helper/group component under `components/chat/`; modify `messages.tsx`, `message.tsx`, `tool-activity.tsx`; tests `tests/unit/activity-groups.test.ts`, existing `workbench-ui.test.ts` where expectations intentionally change.

- [ ] Add failing pure tests for adjacent tool-only messages, mixed parts, user/text/reasoning/source/artifact boundaries, approval-responded denial, unfinished idle calls and aggregate state. Include same-status appended approval/failure event identities, pending-approval priority, and unchanged-event manual-choice retention. Verify failure with `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test corepack pnpm exec tsx --conditions=react-server --test tests/unit/activity-groups.test.ts`.
- [ ] Implement focused pure projections retaining message/part references and IDs. Exclude existing special renderers. Add compact disclosure group with real counts/status, timeline children and state-transition/manual-choice preservation. Keep approvals/errors visible, preserve raw details and readonly.
- [ ] Integrate without changing canonical message state, regeneration/votes or tool dispatch. Avoid nested collapsible selectors rotating unrelated icons. Test rendering and transitions; run explicit unit files and type check.

### Task 2: Standard artifact viewer

Files: `workspace.tsx`, `artifact.tsx`, `document-preview.tsx`, focused artifact presentation helper if useful, `result-table.tsx`, optionally `result-table-source.tsx`; UI regression tests.

- [ ] Write failing tests for type label text/code/image/sheet, localized createResultTable title, scoped table actions, single version navigation and compact table controls. Update obsolete styling-only assertions intentionally, retaining behavioral assertions.
- [ ] Implement standard artifact header with title/type, unify secondary lifecycle metadata and avoid duplicate version navigation. Workspace tab says “产物”. Reuse renderers; table label does not introduce a backend kind or generated row values.
- [ ] Consolidate table toolbar and move nonessential text out of the data plane. Notes start closed even when saved but remain discoverable with saved-note indicator; save/status always available, history readonly. Keep source/full raw evidence drawers and all exports.
- [ ] Run targeted tests, type check, formatting and diff check. Self-review, commit implementation. No real env/model/provider calls, no `pnpm build`, no all-unit glob.

## Chunk 2: Independent review and root verification

- [ ] Read-only spec review, fix gaps through sole writer, then read-only code quality review.
- [ ] Root verifies fixture services and browser against actual running worktree; exercise tool disclosure/approval and table open/save/reopen/details/exports, plus a generic text artifact.
- [ ] Check desktop/mobile light/dark, overflow, keyboard. Take actual screenshots, not substitutes for functioning UI.
- [ ] Fast-forward primary only after root verification; rerun explicit safe suite, type check and isolated direct Next build. No push/deployment claim.
