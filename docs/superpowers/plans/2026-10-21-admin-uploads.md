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

Files: new `app/(admin)/admin/layout.tsx`, `/admin/page.tsx`, `/admin/connections/page.tsx`, focused admin shell/components; modify `components/chat/agent-library.tsx`, `app-sidebar.tsx`, `sidebar-user-nav.tsx`, chat server layout; new admin/auth presentation tests. Preserve `lib/agent/mcp-settings` service and protected management API.

- [ ] First write failing tests: personal settings never mount management/editor, even for admin; admin link only based on trusted server-derived permission; admin layout rejects non-admin before displaying private controls; admin page uses existing guarded MCP APIs.
- [ ] Add independent full-page `/admin` navigation, professional compact data-oriented UI consistent with existing tokens. Implement only real pages (connections first, storage follows); no empty model/billing/log placeholders.
- [ ] Reuse exact regular UUID admin allowlist. Centralize shared helper if useful without granting new users permission or client-controlled roles; keep legacy MCP environment compatibility. Every management API still independently guards reads/writes and Origin.
- [ ] Add a separate “平台管理” entry for admins. Admins opening personal settings still see only personal settings, never global editing.
- [ ] User tools/skills remain read-only; technical deployment state is not a personal preference. Rename links/prompts correctly and test no obsolete “settings can configure storage” promises remain.
- [ ] TDD green, targeted lint/typecheck; independent spec then quality review. Do not commit/push until root can validate actual routes/roles.

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
