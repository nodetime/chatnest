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
- `lib/uploads/service.ts`, `local-store.ts`: original hash/integrity, existing private ownership/association/lifecycle plus quota-counted persisted extraction; large-document context integrity uses streaming verification, not retained binaries.
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
