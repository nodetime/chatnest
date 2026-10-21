# Visual MCP Settings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Let a workspace administrator add, discover, authorize and enable HTTP MCP services in ChatNest, without hardcoded provider tools or restarting active tasks.

**Architecture:** One ChatNest deployment is one shared workspace in this MVP (no invented membership model). Existing file-managed services remain read-only and compatible. New managed services persist as a revisioned AES-256-GCM encrypted PostgreSQL singleton; runtime merges enabled services into a fresh per-task config snapshot. The deployed operator sets immutable admin user IDs and trusted MCP origins in environment variables. Porta remains independent REST + MCP service.

**Tech Stack:** existing Next App Router, React/shadcn/Tailwind, @ai-sdk/mcp HTTP client, Zod, node:crypto, postgres/Drizzle, node:test/tsx.

## Approved behavior and security contract

- Existing tools tab becomes a clear compact connection list: service/name/status/tool count, add/edit/test/enable/disable/delete for administrators. Keep current theme/tokens. Ordinary users see capabilities, not connection details or admin controls.
- Admin is a regular authenticated session whose exact immutable UUID is in `MCP_ADMIN_USER_IDS`; guest and absent IDs always deny. No implicit first-user admin. All mutation/test routes also require same-origin Origin; missing/cross-origin denied.
- `MCP_SETTINGS_ENCRYPTION_KEY` must decode strictly to 32 random bytes (base64). No fallback key, no secrets in source, logs, errors, GET responses, model prompts or localStorage. Admin initially types a secret in the form, sends over HTTPS, then UI clears it. GET returns header names/presence only, not secret values. Query/path tokens in URLs are not reflected; edits preserve an opaque existing connection unless explicitly replaced.
- Encryption uses fresh nonce per save, authenticated version/context/revision, rejects corrupted ciphertext/wrong key. DB stores updater UUID/time and revision; optimistic CAS prevents lost updates (409). All managed service names and endpoints/headers stored inside encrypted payload. No in-memory-only persistence.
- `MCP_ALLOWED_ORIGINS` is a comma-separated deployment-controlled exact origin allowlist. Browser cannot modify it; no wildcards. Management requires it, no network request before policy validation; enforce it in runtime too. HTTPS only except explicit existing dev/test loopback HTTP opt-in. Reject credentials/fragments/env substitution/CRLF and dangerous transport headers. No subprocess/stdio/imported commands.
- Allowlisted origins are operator-trusted egress destinations, including intentionally private Porta origins if explicitly configured. This is not a general arbitrary-URL proxy: document network/DNS/egress firewall responsibility, no claims of DNS-pinned public-IP validation. Per-request fetch enforces the configured endpoint origin/path and redirect:error; never forwards secrets to another destination.
- Network/discovery bounded by timeout, tool count/name/metadata sizes, request body size, response size if feasible using bounded stream. Discovery initializes and lists tools only, never invokes a tool. Always closes client; generic sanitized failures. One initialize/list action at a time per UI.
- Native remote names/description/inputSchema remain intact in runtime; accept legal MCP names including dots and up to 128 characters. Use a deterministic collision-resistant model-compatible alias (max 64 characters, ASCII alphanumeric/underscore/hyphen), preserving existing aliases when valid; never rename upstream calls or schema. Sanitize managed SDK discovery/execute thrown exceptions as well as isError bodies so URLs/headers do not reach model/UI; expose names/descriptions from tools/list for user selection. Every visually managed tool requires per-call approval (no autoApprove controls in this MVP), irrespective of remote annotations. No paid calls during testing.
- Save validates/rediscover selected allowed tools server-side (or uses short-lived server-authenticated discovery proof tied to full endpoint+headers), never trust client-provided discovered list. Editing endpoint must not reuse old secrets automatically for a different destination. Header values can be kept opaque on edits; explicit replacement replaces all.
- JSON import only supports ONE HTTP MCP connection using a clearly documented `mcpServers` URL/headers shape (no command/args); populates form, then test/select/save. Nothing executes on import. Reject ambiguous/oversized/multi-server config rather than silently dropping it.
- Maximum 8 combined file+managed services, unique IDs; bounded headers/fields/allowlist. File collisions fail. Disabled managed entries remain visible to admin but excluded from runtime. Delete removes persisted secret. Enable/disable uses revision CAS and cannot change connection contents.
- Runtime reads file+managed config once at new task start, then snapshots it. Existing run not mutated. Stored DB errors do not silently reuse stale in-process secrets. Absent management environment preserves deployment JSON behavior, and UI explains administrator setup requirement without leaking values. Existing file Exa auto-approval behavior preserved.

## Chunk 1: encrypted settings, discovery and API

### Task 1: server boundary and persistent management

**Files:** create focused modules in `lib/agent/mcp-settings/` for types/schema, admin/security, crypto, repository, service, discovery/network. Add `app/(chat)/api/agent/mcp/route.ts` and a test route if desired; modify `lib/db/schema.ts`, add `0001_mcp_settings.sql` and journal entry. Add `tests/unit/mcp-settings*.test.ts`.

- [ ] Write failing node:test cases for admin/CSRF, strict key parsing/randomized encrypted roundtrip/tamper, input bounds, trusted origins/per-fetch policy, secret-preserving edit and different-target replacement, CAS/conflict, enable/delete, server-side allowlist validation and cleanup on discovery failure. Use injected in-memory repository and fake MCP client for focused tests; add actual isolated PostgreSQL/HTTP MCP proof separately.
- [ ] Run `corepack pnpm exec tsx --test tests/unit/mcp-settings*.test.ts` and confirm meaningful failure.
- [ ] Implement small typed modules, lazy DB connection (no dotenv / actual .env reads), migration and sanitized API responses/errors. Public projections expose only nonsensitive metadata. Inject dependencies at service/API boundary so authorization and errors are actually exercised.
- [ ] Rerun focused suite and `corepack pnpm exec tsc --noEmit`. Self-review auth, secret flow, network boundary and race handling before commit.

## Chunk 2: runtime and user-facing management

### Task 2: visual tools connections and task integration

**Files:** modify `lib/agent/config.ts`, `lib/agent/runtime.ts`, `app/(chat)/api/agent/route.ts`, `hooks/use-agent-info.ts`, `components/chat/agent-library.tsx`; create small components under `components/chat/mcp-*` and client-safe types/helpers where useful. Add tests for runtime snapshot/approval plus UI checks.

- [ ] Write failing tests showing saved enabled config is read only by subsequent runtime; existing runtime retains old tools; disabled entries absent; all managed tools approval-gated; legacy file/env behavior unchanged; no credential projection. Include test proving discovery does NOT execute tools.
- [ ] Implement config merge without circular imports or server-only leaking into client. If native test imports of server-only modules are needed use documented react-server conditions or dependency-injected pure code; do not remove server-only safeguards to satisfy tests.
- [ ] Build accessible responsive management list and editor using existing controls. Fields: id/name/HTTPS endpoint, optional secret headers (JSON or labeled rows), enabled, discovered tool checklist. Existing connection editor keeps secret fields blank with explicit keep/replace behavior. Show no false connected state on simple saved settings. Test states: not tested/discovering/discovered/failure; saving disabled until current inputs verified. Explain service-side activation/billing separate from connection success.
- [ ] Add/edit/delete/toggle recover errors in place; request pending guards; optimistic revision conflict asks refresh and does not wipe typed secrets unexpectedly. Confirm delete. Ordinary users see readonly capabilities.
- [ ] Test responsive layout/keyboard/labels/empty/error/loading with synthetic local-only fixtures. No real provider/model calls, no real credentials.

## Chunk 3: independent validation and documentation

### Task 3: proof and operational documentation

**Files:** `.env.example`, `docs/integrations/mcp-settings.md`, optional README small pointer. Keep this plan status accurate.

- [ ] Document exact administrator setup (UUID lookup via trusted DB/admin procedure), key generation (`openssl rand -base64 32`), secure key backup/rotation by decrypt-and-reencrypt migration (not simply changing key), trusted-origin configuration, migration/deploy steps, legacy readonly config, single-workspace scope and next-task application. No real values.
- [ ] Independent spec review then security/quality review; sole implementation writer fixes findings and re-review.
- [ ] In primary verification checkout rerun new suites + baseline suites (porta, porta-errors, agent, message-turn, model-connection, browser, task-experience), typecheck and targeted lint; run direct Next build ONLY with isolated clean fixture environment (skip `pnpm build` migration wrapper). Isolated actual Postgres migration/CAS/encryption roundtrip and synthetic HTTP MCP discovery/runtime evidence if Docker available. No paid provider calls.
- [ ] Record exact evidence and any remaining deployment setup/manual browser gaps. Never conflate mocks with live vendor proof. Commit feature on `feat/mcp/visual-settings`, no unrequested production migration or remote merge.
