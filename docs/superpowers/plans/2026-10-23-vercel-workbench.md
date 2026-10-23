# Vercel-backed workbench implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. One source writer; independent reviews; root-only browser/fixtures/build.

**Goal:** Replace ad-hoc UI assembly with actual official primitives and useful general Agent interactions, not another cosmetic pass.

**Architecture:** Existing state/transport/persistence remain. Pin missing AI Elements Artifact/Task; compose existing Conversation/PromptInput. Pure native artifact catalog and title projection feed contextual chrome. Shared header eliminates duplicate workspace/document bars.

**Tech Stack:** Existing Next16/React19/AI SDK7/shadcn/Radix/Tailwind; no new packages.

## Chunk 1: official composition and contextual workspace

Files create: components/ai-elements/{artifact,task}.tsx; pure components/chat/artifact-catalog.ts and chat-title.ts (or lib/artifacts/ consistent responsibility); components/chat/{artifact-picker,workspace-header}.tsx. Modify components/chat/{chat-header,multimodal-input,messages,workspace,artifact,activity-group,shell,greeting}.tsx as needed; hooks/use-active-chat.tsx only to expose existing title data; app/(chat)/api/messages/route.ts only existing guarded title field. Update THIRD_PARTY_NOTICES.md plus full upstream license file. Add focused tests/unit/vercel-workbench.test.ts, preserve workbench-ui/layout/activity/lifecycle tests. CSS only scopedchat ifneeded.

- [ ] Read map/lessons/spec and actual source. Record pinned Artifact/Task source and license; no latest installer, demos, model calls or migrations.
- [ ] Write failing tests for validated catalog (native successes only, knownerrors rejected, iddedup/latesttitle, no mutation), title fallbacks/live title, singleheader/officialcomposition, model in composer, real per-chat file selection and dirty/streaming guards. Run targeted tests to prove red.
- [ ] Adapt official primitives with namespaced imports to avoid business Artifact collision; keep license+modification notice. Task trigger must use native button. No redundant design framework/dependencies.
- [ ] Build catalog+picker using actual current chat messages only. Select via original openArtifactPreview + explicit workspace document show. Disable selection while actual artifact stream/unsavededit; retain current view on failure. Emptyworkspace lets user choose existing items.
- [ ] Build shared header composition: currentfile+picker/actions/expandclose and keyboard menu for document/browser/source; active document has no outer duplicate48px workspacebar. Original per-kind callbacks, table protections/history and document fetch/save unchanged.
- [ ] Contextual conversation title + footer model selection; organize original upload/text/buttons through PromptInput subcomponents. Do not replace private uploads with upstream demo base64 behavior.
- [ ] Compose existing Conversation with one scroll owner keyed by chat; remove conflicting custom scroller; keep all SDK parts and callbacks in original order. Task wraps original disclosure/state logic, not a plan engine.
- [ ] Run explicit targeted UI/catalog tests, tsc --noEmit --incremental false and changed-file ultracite; inspect own diff and commit source/tests/notices only. Root owns trackingdocs and .local-review.

## Chunk 2: review and independent verification

- [ ] Independent spec reviewer: actual components/interaction vs spec; correct integration and no new fixed workflow. Writer resolves issues and reviewer rechecks.
- [ ] Independent quality reviewer: lifecycle/undo/memo/focus/scroll, native catalog authority, stalechat leakage, title authorization, duplicate chrome, dirty stream guards, license. Writer resolves issues/recheck.
- [ ] Root explicit safe full offline list, types, format; isolated dependency clone + direct next build --webpack (never migration build).
- [ ] Root CUA test multi-file/kind selection, save then switch, close/mode/refresh/newchat isolation; real upload/read+HTTP MCP approval/table; manual long-stream scroll/jump, stop/edit; table sources/CSVJSON/history; mobile and6lightdark viewport screenshots, production smoke. No screenshots or fixtures in tracked source.
- [ ] Record actual limitations/results, clean source, retain preview. Merge locally only after root verification; no remote publish claimed.
