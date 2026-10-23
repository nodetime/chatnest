# ChatNest codebase map

- `app/(auth)/auth.ts`: NextAuth credentials/guest sessions. User has ID/type; there are no workspace roles.
- `lib/db/schema.ts`, `lib/db/migrations/`: Drizzle PostgreSQL schema/migrations. `pnpm build` runs migrations first; do not run against real settings during tests.
- `lib/agent/config.ts`: deployment JSON/env MCP configuration, validation and resolution.
- `lib/agent/runtime.ts`: per-task config snapshot, HTTP MCP client, dynamic tools/list schema discovery, allowlist and approval gating.
- `app/(chat)/api/agent/route.ts`: authenticated capability summary, never credentials.
- `components/chat/agent-library.tsx`, `hooks/use-agent-info.ts`: tools/skills/settings dialog and summary fetch.
- `components/ui/`: existing shadcn/radix components/tokens; reuse instead of redesigning.
- `tests/unit/`: tsx/node:test offline suites; existing tests inject fake MCP clients and temporary configs.
- `config/agent.json`: default file-managed Exa/Tavily/Porta services. Preserve compatibility and environment secrets.
- `lib/ai/telemetry.ts`: shared metadata-only AI tracing policy, explicitly applied to all nine model calls; input/output content recording stays off even with global OTel registration.
- `lib/agent/browser-policy.ts`: existing browser policy, not a sufficient MCP egress policy by itself.
- `.local-review/` is ignored; private probes/fixtures must stay out of tracked files.

MCP management additions are isolated under `lib/agent/mcp-settings/`, `/api/agent/mcp`, and focused tools-tab components. Porta is a separate repository/service and does not depend on this UI.

Platform administration:
- `app/admin/layout.tsx`: Suspense-wrapped server gate before the client shell; passes only signed-in display identity.
- `components/admin/admin-shell.tsx`, `admin-navigation.tsx`: template-derived full-height admin sidebar/header, desktop collapse and mobile Sheet. Source/commit/full MIT notice in `THIRD_PARTY_NOTICES.md`.
- `/admin` uses `components/admin/admin-overview.tsx` and independently guarded `/api/admin/overview`; `lib/admin/overview.ts` isolates real readiness reads, never performs model calls or live connection probes.
- `/admin/connections` reuses the existing MCP service/editor, presented as a searchable table with action menus and a side Sheet. File-managed connections remain read-only.
- `/admin/storage` reads guarded `/api/admin/storage`; local-only image configuration, actual write/read/delete probe and bounded cleanup. `docs/integrations/private-uploads.md` documents deployment and lifecycle.

Private document ingestion (Task 3):
- `lib/uploads/document-types.ts`: browser-safe supported formats, 64 MiB document limit, text extraction states and segment contract; original image limits remain 5 MiB / 15 images / 20 MiB context.
- `lib/uploads/document-parser.ts`, `document-worker.cjs`: one admitted native Node worker, restricted environment, 20s deadline/cleanup; PDF.js text pages, Mammoth paragraph/table text, streaming ExcelJS worksheets, CSV/TXT; bounded ZIP actual-inflate/CRC/XML preflight. No OCR, password handling, external fetch, macros or formula execution.
- `lib/uploads/document-budget.ts`, `context.ts`, `read-attachment.ts`: one shared 100k source-character model-round budget including actual deduplicated 2k previews; optional <=16k `readAttachment` calls reauthorize through `service.readAttachmentAsset` every time. Historical raw read bodies are model-projected to explicit reread metadata, preserving canonical DB/UI results.
- `lib/uploads/service.ts`, `local-store.ts`: original hash/integrity, local-driver rejection on Vercel Functions (`VERCEL=1`), existing private ownership/association/lifecycle plus quota-counted persisted extraction; large-document context integrity uses streaming verification, not retained binaries.
- `lib/db/migrations/0003_document_ingestion.sql`: extraction JSON + actual UTF-8 `derivedBytes`; raw+derived quota accounting; image/document-specific size constraint.
- `next.config.ts`: 65mb bounded Next proxy envelope; build-only pinned NFT worker dependency closure plus PDF assets/native canvas. Literal native `require.resolve` host seeds + external parser packages preserve pnpm resolution symlinks in real route traces.
- `components/chat/preview-attachment.tsx`, `tool-activity.tsx`: text-only document states, failure retry/removal and cited attachment-read cards, without changing Agent-selected tool/skill flow.
- `tests/unit/document-ingestion.test.ts`: offline synthetic parser/budget/ZIP/worker/context/UI regression coverage. Independent root verification owns ignored mock HTTP/DB/browser/production/hermetic trace fixtures; these are not paid-provider acceptance evidence.

Optional deterministic result artifacts:
- `lib/agent/result-evidence.ts`: bounded successful-MCP ledger, DB-only history restoration and pure SDK model projections; `approval-transport.ts` sends only approval decisions.
- `lib/artifacts/result-table.ts`: immutable JSON envelope, strict pointers, limits, deterministic view/sort/filter and formula-safe CSV; `stream-state.ts` handles atomic table events.
- `lib/ai/tools/create-result-table.ts`: optional Agent-selected creation from actual MCP evidence; no secondary model or automatic workflow.
- `/api/document/result-table` and dedicated DB transaction helpers: bound-chat ownership and expectedVersion view/notes CAS; generic document mutation paths protect evidence.
- `components/chat/result-table.tsx`: existing Workspace sheet surface with read-only original values, compact controls, provenance, raw details, exports and separate notes.

Chat-only workbench presentation:
- `app/(chat)/layout.tsx` supplies `.chat-workbench`; `app/globals.css` scopes shell surfaces and `.chatnest-result-grid` token/13px density overrides to chat, leaving admin/global themes unchanged.
- `components/chat/activity-groups.ts`, `activity-group.tsx`: presentation-only grouping across adjacent generic tool calls, skipping only known nonvisual SDK metadata/empty text; visible reasoning/text/source/artifact boundaries and canonical message identities stay intact. Summaries use actual call states/counts; pending approval wins, idle unfinished calls are not shown as running, and only the native table tool's known error envelope is projected as failure.
- `components/chat/tool-activity-state.ts` reconciles disclosure on tool-state/approval-event identity transitions while preserving unchanged-event manual choices; tool inputs, approvals and raw evidence stay unchanged.
- `components/chat/result-table-source.tsx` progressively reveals all original source fields in a localized Sheet; `result-table.tsx` keeps raw-row details, exports and independent view/notes save controls. Artifact lifecycle/version labels use Chinese display text and date-fns `zhCN`, without translating Agent messages or provider fields.
- `components/chat/artifact-type-label.tsx`, `artifact.tsx`, `artifact-actions.tsx`: standard multi-type artifact viewer with type labels, accessible header actions and one footer version navigator. Table-specific filter/columns/exports/notes are contained within the table renderer, not imposed on text/code/image artifacts.
- `components/chat/text-editor.tsx`: ProseMirror mounts once per component lifetime; transaction-based external/streaming updates preserve editor identity, focus, dispatch guards and read-only previews. `tests/unit/text-editor-lifecycle.test.ts` is an isolated hook/ProseMirror-boundary regression harness; actual typing remains browser acceptance.

Workbench visual refinement (2026-10-22/23):
- Chat-only semantic light/dark palette and224px sidebar live under `.chat-workbench`; flat panes now share64px top chrome (Vercel composition pass). Admin and global themes are unchanged.
- `document-preview.tsx` uses actual chat workspace visibility/documenttab + artifactidentity for active compact cards; its original activation also explicitly opens the documenttab. All four kinds use a lightweight file entry in chat; editors and full contents mount only in the normal workspace. Loading, generating and load-error states are distinct and document-scoped. Actual-hook/component lifecycle tests cover close/reopen, tab switches and chat isolation.
- `toolbar.tsx` is a normal header dropdown delegating original per-kind artifact callbacks; console repair adds an action without replacing originals. Current/read-only/protected-evidence guards remain in artifact.tsx.
- `workspace.tsx` uses explicit stretch height (overrides preflight hrheight0) and8px pointer target around a1px line; ARIA/keyboard/resize bounds remain.


Vercel template/component composition (2026-10-23):
- `components/ai-elements/{artifact,task}.tsx` pin/adapt actual Apache-2.0 upstream primitives; full pinned upstream notice/license and Apache text live beside them, attributed in `THIRD_PARTY_NOTICES.md`. Existing Conversation/PromptInput are reused, not a new runtime/framework.
- `components/chat/messages.tsx` owns one per-chat Conversation scroll system with native jump-to-bottom; canonical message ordering, activities and callbacks stay intact. `chat-header.tsx` displays the contextual title; original model control lives in PromptInputFooter, with attachment/text structure in Header/Body.
- `chat-title.ts` projects live/persisted/first-user/new-chat identity. `/api/messages` exposes only the already-authorized fetched chat title; no new query or access rule. `use-active-chat.tsx` exposes presentation title without changing transport or Agent scheduling.
- `artifact-catalog.ts` indexes successful strict native document/table outputs (UUID id, exact kind, title), excludes errors/dynamic lookalikes and deduplicates latest metadata; no global active-document membership inference. `artifact-picker.tsx` reuses original preview activation plus explicit document mode.
- `workspace-header.tsx` supplies the sole visible 64px header with file selection, original actions, mode menu and expand/close; browser/source/document bodies remain mounted on mode changes. Actual text/code/image/sheet renderers remain authoritative.
- `result-table.tsx` projects its existing dirty/saving state through the sheet adapter into existing per-document metadata solely to guard the new file chooser, including late-document callback rejection. Original evidence, CAS, versions and save route are unchanged. Text dirty/streaming guards use their existing states.
- `tests/unit/vercel-workbench.test.ts` adds pure catalog/title validation plus actual picker/table/parent callback behavioral harnesses. Root browser/HTTP proof stays ignored; mock-model verification does not imply live supplier/model acceptance or durable background execution.


Readable tool records (2026-10-23 follow-up):
- `Messages` now always renders canonical `PreviewMessage(message.id)`, independent of whether final text has arrived. Do not reintroduce outer content-dependent cross-message Tasks: they unmount inspected tools when an answer appears. `groupActivityParts` retains adjacent tools within one message; the old cross-message pure helper is no longer a rendering owner.
- `activity-group.tsx` has no singleton group trigger, keeps keyed tool rows mounted across singleton/multi and preserves a visible inspected-call trigger through completion. `message.tsx` avoids no-text intermediate tool action bars while preserving real answer/artifact/regeneration actions.
- `attachment-read-result.tsx` validates returned file shape, renders bounded exact excerpts/refs directly and keeps partial/extraction warnings. Character/segment/trust-boundary bookkeeping remains in original evidence, not main conversation text.
- `tool-call-details.tsx` is the separate keyboard Sheet with exact original name/input/output/error, including false/0/empty string/null. Its trigger is beside the action, not under result collapse. Exact native createResultTable active handoff has no ephemeral inspector; failure/denial/incomplete/terminal fallbacks and MCP same-name calls retain details.
- Latest submitted approval continuation is active in the UI, while historical idle unfinished calls stay incomplete. Agent selection, canonical message parts, native artifacts and MCP parameters are unchanged. `tests/unit/tool-records.test.ts` includes full parent-to-Sheet identity transition regression, not just separately rendered states.

Unified tool results (2026-10-23):
- `tool-presentation.ts` is browser-safe display projection only: exact native identities, server-generated alias metadata, trusted short search/web actions, bounded record/source/text previews and scoped empty/partial states. Unknown aliases remain original; no substring-based action claims.
- `mcp-settings/projection.ts` adds credential-free `toolAliases` using runtime's authoritative server-only alias function; `use-agent-info.ts` receives that optional metadata. No client crypto, new remote discovery or scheduling change.
- `tool-result-preview.tsx` renders compact titled records with their actual links/domains, short original-key fields and plain skill/reference text. MCP transport metadata/mirrored structured text do not become a debug tree; full canonical data stays in ToolCallDetails. URLs must be HTTP(S), credential-free; no automatic media fetch or markup execution.
- `ToolActivity` retains disclosure/approval/Sheet ownership; all generic outcomes have meaningful bodies. Exact dynamic/native exclusions also apply in `isActivityPart`. Trusted short labels remain intact on narrow screens; arbitrary aliases/skill names still truncate.
- `tests/unit/unified-tools.test.ts` plus existing lifecycle and MCP projection tests cover bounded/falsey/mixed/malformed results, identity collisions, omitted-field notices, nested empties and credential-free alias mapping.

Lessie-inspired workbench refinement (2026-10-23):
- Chat-only neutral white/gray tokens with mint selection, 208px sidebar, 52px aligned header rails and 68% default artifact width; resizable/mobile generic Workspace unchanged.
- `result-table.tsx` keeps filter/columns/export/source/notes in the top toolbar. Controlled notes Sheet owns no duplicate draft; parent state and expectedVersion CAS remain authoritative. Save appears only for dirty/saving state.
- Workspace grid uses 42px header/46px rows; chat entries no longer mount duplicate inline tables/editors. Default columns are title220/other140 with min120 and user resizing.
- `vercel-workbench.test.ts` exercises actual hook/event render state for notes close/reopen/save/errors/readonly and both grid densities. Full acceptance: `docs/superpowers/plans/2026-10-23-lessie-workbench-verification.md`.

Structural correction after rejected visual acceptance (2026-10-23):
- `PreviewAttachment` compact mode is used only for sent documents (adaptive width, 32px height); upload queue/status/error actions and image previews keep their full presentation. `file-symbol.tsx` provides the shared quiet file icon for attachments and artifact entries.
- `result-table-row-details.tsx` displays actual declared labels/values/links; source IDs and original JSON remain in a collapsed technical section. The first displayed result column is frozen and emphasized; raw rows are untouched.
- Generic artifact header uses one filename/type line, with idle timestamp contextual and pending/error states still visible.
- Preview CSS can remain stale in persistent Turbopack cache; verify computed browser styles, not only modified source. In this acceptance the owned `.next/dev` cache was moved to ignored backup and the fixture service restarted; no source workaround was added.

Composition correction after second rejected visual acceptance (2026-10-23):
- `WorkbenchSidebarProvider` opts only chat into `SidebarProvider.temporaryCollapseKey`. Artifact focus temporarily hides history without changing cookie preference; explicit reopening is local to focus, closing restores the saved choice.
- `Workspace` defaults to remaining width after a 400px conversation. Manual resize stays chat-local (35–80%); mobile remains a full-screen generic viewer.
- `Artifact` passes a normal `renderHeader` slot through sheet rendering. `ResultTableView` owns its authoritative draft and renders title/actions in that same header; no portal or duplicated table state.
- Desktop header is one52px row; panes ≤500px use an intentional second action row. Filter/column/export Popovers handle collision outside the clipping artifact container. Last secondary table column absorbs spare width; canvas uses card surface.
- Visual acceptance must compare against the supplied Lessie reference, not merely old ChatNest screenshots. A passing regression suite does not establish aesthetic equivalence. Keep people/match/outreach semantics out of the generic table unless actual data/features support them.

- Chat detail polish: consecutive assistant messages share one quiet ChatNest sender label. Expanded activity groups use a light timeline and aligned detail controls while preserving approval/error visibility, raw-data sheets and focus restoration.
