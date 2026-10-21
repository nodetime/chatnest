# Platform administration and upload repair implementation plan

> **For agentic workers:** REQUIRED: use subagent-driven-development, TDD, and independent spec/quality reviews. One implementation writer at a time; root owns isolated actual HTTP/browser/DB verification.

**Goal:** Separate platform operations from personal settings, replace misleading upload setup hints with a real administrator entry, and verify private attachment upload through model delivery.

**Architecture:** Same Next repository, independent `/admin` shell and guarded pages; reuse current encrypted MCP service rather than duplicating provider configuration. Personal settings contain only personal presentation/preferences and read-only capabilities. Uploads require an explicit storage service, ownership metadata and bounded byte reads; model delivery resolves registered assets server-side instead of trusting arbitrary client URLs.

**Tech stack:** existing Next/React/shadcn, Drizzle/PostgreSQL, node:fs/crypto, AI SDK 7, node:test/tsx. Do not run real supplier/model calls or read actual secrets.

## Investigation evidence (before any implementation)

- Real local fixture POST `/api/files/upload` returns 503 and points to storage setup in personal settings, but no setup interface exists. Evidence: ignored `.local-review/upload-before.json`.
- Current uploader accepts only declared JPEG/PNG <=5 MiB, relies on `BLOB_READ_WRITE_TOKEN`, stores public blobs, and has no asset owner record or CSRF/body stream bound.
- Chat file schema accepts arbitrary `z.url()` including oversized data URLs and file/ftp/external HTTP. Installed SDK usually forwards HTTP image URLs to OpenAI/gateway; do not misreport this as a proven application SSRF.
- Model vision is only enforced by menu state, not paste/submit/backend. Messages/title generation start before file/model validation.
- A→B→A upload and overlapping batches can reinsert stale files or exceed the 15-file count. Generation tokens plus synchronous admission are needed.
- Private file route must not use Next Image optimizer (cookies/cache), and private URLs cannot be handed to a model that lacks browser cookies.

## Chunk 1: independent platform administration

### Task 1: migrate current MCP management out of personal settings

Files: new `app/admin/layout.tsx`, `/admin/page.tsx`, `/admin/connections/page.tsx`, focused admin shell/components; modify `components/chat/agent-library.tsx`, `app-sidebar.tsx`, `sidebar-user-nav.tsx`, chat server layout; new admin/auth presentation tests. Preserve `lib/agent/mcp-settings` service and protected management API.

- [x] First write failing tests: personal settings never mount management/editor, even for admin; admin link only based on trusted server-derived permission; admin layout rejects non-admin before displaying private controls; admin page uses existing guarded MCP APIs.
- [x] Add independent full-page `/admin` navigation, professional compact data-oriented UI consistent with existing tokens. Implement only real pages (connections first, storage follows); no empty model/billing/log placeholders.
- [x] Reuse exact regular UUID admin allowlist. Centralize shared helper if useful without granting new users permission or client-controlled roles; keep legacy MCP environment compatibility. Every management API still independently guards reads/writes and Origin.
- [x] Add a separate “平台管理” entry for admins. Admins opening personal settings still see only personal settings, never global editing.
- [x] User tools/skills remain read-only; technical deployment state is not a personal preference. Rename links/prompts correctly and test no obsolete “settings can configure storage” promises remain.
- [x] TDD green, targeted lint/typecheck; independent spec then quality review. Do not commit/push until root can validate actual routes/roles.

### Task 1 completion evidence (2026-10-21)

- Implemented independent `app/admin` shell and server-side regular UUID gate behind Suspense; only the real connections page is navigable. Shared `lib/admin/access.ts` recommends `PLATFORM_ADMIN_USER_IDS`, with explicit-empty revocation and fallback to legacy `MCP_ADMIN_USER_IDS` only when unset. Existing MCP APIs retain per-request authorization and Origin checks.
- Server-computed permission flows through chat layout → AppSidebar → SidebarUserNav. Personal appearance works independently of capability-summary availability; both administrator and ordinary tools/skills remain read-only. Admin MCP management reads its protected API directly, independently of model/skill summary success.
- TDD: missing behaviors first failed, then 7 new access/real React HTML/structure regressions passed. Root independently reran original 67 + new 7 tests: 74/74; TypeScript and diff checks passed. Implementation writer also verified targeted Biome across 19 changed source/test files.
- Root actual isolated HTTP evidence: anonymous/ordinary/admin role matrix for `/admin` and `/admin/connections`, independent shell (no chat shell), MCP GET admin 200/ordinary 403, and bad-Origin write 403. Root actual in-app browser confirmed independent management UI and existing CRUD controls. Spec and quality reviews approved Task 1.
- Upload hints no longer promise a nonexistent personal storage setting; actual private storage/upload repair, production build/start and further attachment evidence remain Task 2/3 scope below. No paid model/vendor requests were made. Private fixture evidence remains ignored and excluded from commits.

## Chunk 2: actual upload service and private attachment delivery

### Task 2: repair currently supported image path before expanding formats

The current product only implements JPEG/PNG. User has been asked asynchronously whether PDF/Word/Excel should be readable in this phase; do not claim broader support unless extraction/model paths and actual tests exist. Preserve original bytes and provenance; no silent image modifications.

- [ ] Finalize storage/provider scope with root after capability investigation. A private local persistent-directory adapter can run without vendor credentials for development/long-lived self-hosted servers; cloud object storage can be a separate adapter, not a publicly exposed object by default. Production must not silently choose ephemeral disk. Document deployment constraints.
- [ ] Add a real storage administration page with capability/status and meaningful test/setup actions. Ordinary users are told to contact an administrator; admins get a working management link. Never store provider keys in browser persistence or expose saved keys.
- [ ] Authenticate uploads; enforce same-Origin, bounded multipart request body, nonempty file and trusted content sniffing, canonical MIME, random asset identifier, max size/count/quota, safe UTF-8 display name. Reject unsupported files clearly, no misleading arbitrary file support.
- [ ] Asset metadata records owner, MIME/size/hash, storage locator and association/lifecycle. Storage uses private reads; owner/authorized chat visibility are checked server-side on every GET. Never trust a client URL for model fetch; accept only registered asset refs and server-side resolve bounded bytes. Cache private reads no-store and avoid image optimization proxy.
- [ ] Validate model capabilities and every incoming/history attachment before saving message or issuing title/model requests. Unsupported vision gives an actionable error and preserves draft. Enforce the advertised count both server/client; bound context byte budget.
- [ ] Fix generation-aware cancellation, upload batching admission and submit guards. Removing a draft/abandoned upload cleans safe unreferenced assets; do not delete files still used by messages. Define public→private and deletion behavior explicitly.
- [ ] Tests first for malformed/oversize/unsupported, spoof MIME, paths, unauthorized/other user, stale generation, parallel admission, model rejection before paid calls, private preview and trusted bytes in actual mock model request. No actual vendor/model charges.

## Chunk 3: independent evidence and handoff

- [ ] Root real isolated Postgres migrations and CRUD/auth tests, actual local byte write/read/delete, two-user read isolation, browser upload/preview/remove, mock-model full turn with inline bytes and no arbitrary URL retrieval.
- [ ] Independent spec and security/quality review; fixes re-reviewed.
- [ ] Root full existing 67 tests + new tests, typecheck, targeted lint, production build/start in clean isolated source (skip real migration wrapper), desktop + narrow-screen actual UI.
- [ ] Documentation accurately distinguishes implemented image support, any newly proven document support, deployment prerequisites and actual paid provider acceptance still pending. No secrets/private fixture artifacts in commit.

### Task 2 concrete scope (root decision)

- Finish the existing JPEG/PNG path first. No document parsing is promised by this patch; unsupported formats receive a clear message. Preserve original bytes, SHA-256 and UTF-8 display names.
- Implement a private local filesystem driver, suitable for this self-hosted Node deployment. `UPLOAD_STORAGE_DIR` is operator-controlled; development may default to an ignored `.data/private-uploads`. Production requires an explicit absolute persistent directory. No silent fallback to public Vercel Blob or ephemeral production disk. Cloud/S3 remains a separate future driver.
- Add actual `/admin/storage` with enabled/disabled status, supported formats/5MiB file limit/15-image task limit, a real write-read-delete connection test and enable/disable control. Persist enabled state with revision/CAS in a singleton DB row; API independently admin + same-Origin guarded. Keep paths/technical errors out of ordinary capability summaries.
- New asset metadata: random UUID, owner, intended chat UUID (draft chat may not exist), original filename, verified MIME, byte count, SHA-256, used/draft lifecycle and timestamps. Storage keys are generated UUIDs, never client paths. Private file permissions, no symlink traversal; quotas reserve atomically before disk writes (100MiB/user,1GiB deployment defaults, bounded configurable values). Roll back reservations if writes fail. Admin disabling new uploads does not revoke access to already-used attachments.
- Bounded multipart reads before form parsing (5MiB+64KiB), one file and valid chat UUID, real PNG/JPEG validation, empty/spoofed/oversize rejection. Same-Origin + regular-user authorization. Return same-origin relative `/api/files/<uuid>` refs and consistent errors. Draft delete is owner-only, same-Origin and forbidden for used assets; expired unreferenced drafts may be purged with a bounded cleanup path.
- File GET checks owner and intended chat ownership; used assets may be shown only when associated chat exists and requester owns it or chat is currently public. `private,no-store`, `nosniff`, safe inline Content-Disposition. Do not route through Next Image optimizer. Old public URLs are not silently downloaded/migrated/deleted.
- Chat schema accepts only canonical asset refs (plus explicitly documented rejection of old external URLs). Resolve ALL history/current refs server-side for the current user+chat, verify MIME/size/hash and aggregate context byte limit, and inline bytes to the model. Validate vision and attachments BEFORE new chat/message persistence/title/model invocation. Bind lifecycle before persistence so deletion cannot race used bytes; failures may retain a safe orphan but must not delete a used message attachment. Chat deletion cleans own files best-effort with safe retryable orphan state.
- Client: synchronous admission/count lock; generation token changes on every chat switch and unmount (A→B→A safe); AbortController; stale success/failure/finally cannot alter a later draft. No send while uploads pending, including keyboard/programmatic submit. Remove unreferenced uploads; never lose selected attachments on server/model validation errors. Distinguish unsupported model vs unavailable storage vs upload failure.
- TDD service/API/client helper tests. Root separately verifies real PostgreSQL migration, actual bytes HTTP upload/read/delete, role/Origin/malformed/spoof/oversize/cross-chat isolation, mock-model inline bytes and no call/persistence on rejected attachments, plus browser flow. No real model or vendor requests.
