# Platform Points Closure Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents are available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the frozen ChatNest/Porta platform-points protocol as a type-safe, idempotent AOP execution boundary, with a test-only platform contract fixture because the Payload business repository is not present in the workspace.

**Architecture:** ChatNest owns the outer execution gate, local operation/receipt/outbox state, and platform HTTP adapter. Porta owns permit verification, replay protection, supplier usage receipts, and existing supplier-cost journaling. Customer points remain platform-owned; no wallet is added to Porta. The first implementation supports fixed-call, included, metadata, quote-required, and bounded reported-unit policies through one middleware chain.

**Tech Stack:** TypeScript, Zod, Next.js/Drizzle/PostgreSQL (ChatNest), Node.js HTTP/SQLite/Native MCP (Porta), Ed25519 permit signatures, node:test, existing offline test harnesses.

---

## Chunk 0: Cross-repository contract artifacts and compatibility gate

**Files:**
- Create ChatNest source contract: `docs/contracts/platform-points/openapi.yaml`
- Create ChatNest schemas: `docs/contracts/platform-points/schemas/*.json`
- Create ChatNest vectors: `docs/contracts/platform-points/fixtures/canonical-json-vectors.json`, `permit-receipt-vectors.json`
- Create Porta snapshot: `docs/contracts/platform-points/openapi.yaml`
- Create Porta snapshot: `docs/contracts/platform-points/schemas/*.json`
- Create Porta snapshot: `docs/contracts/platform-points/fixtures/*.json`
- Create ChatNest contract test: `tests/contracts/platform-points-contract.test.ts`
- Create Porta contract test: `apps/server/tests/platform-points-contract.test.ts`
- Create compatibility matrix: `docs/integrations/platform-points-contract-matrix.md`

- [ ] **Step 1: Write OpenAPI/JSON Schema and canonical-signature vectors before production DTOs.**
  - Include capabilities/access/wallet/ledger, reserve, dispatch, report, cancel, receipt lookup, error codes, and protocol versions.
  - Define decimal-string points/units, strict unknown-field behavior, idempotency conflict behavior, and permit/receipt bindings.
- [ ] **Step 2: Write failing parity tests in both repositories.**
  - Validate the same fixtures, canonical JSON bytes, permit signatures, receipt signatures, version rejection, and idempotency conflict examples.
- [ ] **Step 3: Run both contract suites and verify red.**
- [ ] **Step 4: Add a documented snapshot-sync command and CI check.**
  - The Payload repository, once available, becomes the producer; until then ChatNest owns the source snapshot and Porta fails the parity check if its copy drifts.
- [ ] **Step 5: Commit the contract artifacts before runtime implementation.**

---

## Chunk 1: Contract and pricing primitives

**Files:**
- Create ChatNest: `server/domain/billing/types.ts`
- Create ChatNest: `server/domain/billing/policy.ts`
- Create ChatNest: `server/domain/billing/state-machine.ts`
- Create ChatNest: `server/domain/billing/attempt-state.ts`
- Create ChatNest: `server/domain/billing/protocol.ts`
- Create ChatNest test: `server/domain/billing/billing-domain.test.ts`
- Create Porta: `apps/server/src/billing/points.ts`
- Create Porta: `apps/server/src/billing/reconciliation.ts`
- Create Porta test: `apps/server/tests/points-contract.test.ts`
- Modify docs: `docs/01_架构决策/20261030平台积分AOP技术方案-终版评审稿.md` only if implementation behavior requires clarification

- [ ] **Step 1: Write failing tests for policy resolution and legal state transitions.**
  - Cover fixed call, included, metadata, quote-required, tiered, and bounded reported-unit policies.
  - Cover `reserved → dispatching → settling → settled`, `reserved → released`, `dispatching → reconcile_pending`, and `settling → overage_pending`.
  - Separately cover `ready → sending → started → response|failed_before_dispatch|unknown`, `chargeMode=attempt|success`, reconciliation, overage, cap overflow, max-value guards, and price precedence.
  - Cover negative/float/overflow points and illegal transitions.
- [ ] **Step 2: Run the focused tests and verify they fail for missing modules/behavior.**
  - ChatNest: `corepack pnpm exec tsx --test server/domain/billing/billing-domain.test.ts`
  - Porta: `corepack pnpm exec tsx --test apps/server/tests/points-contract.test.ts`
- [ ] **Step 3: Implement branded IDs, canonical tool identity, Zod protocol schemas, policy resolver, and exhaustive state reducer.**
  - Keep transport values as decimal strings; convert to bigint only after validation.
  - Keep supplier usage and customer points as separate types.
- [ ] **Step 4: Run focused tests and typecheck both worktrees.**
- [ ] **Step 5: Commit each repository with a focused contract commit.**

## Chunk 2: Porta permit/receipt AOP

**Files:**
- Modify Porta: `apps/server/src/billing/meter.ts`
- Modify Porta: `apps/server/src/billing/ledger.ts`
- Modify Porta: `apps/server/src/application.ts`
- Modify Porta: `apps/server/src/native-mcp/bridge.ts`
- Modify Porta: `apps/server/src/rest/index.ts`
- Modify Porta: `apps/server/src/config/types.ts`
- Modify Porta: `apps/server/src/config/index.ts`
- Create Porta: `apps/server/src/billing/permit.ts`
- Create Porta: `apps/server/src/billing/receipt.ts`
- Create Porta: `apps/server/tests/points-aop.test.ts`
- Modify Porta: `apps/server/tests/billing.test.ts`
- Modify Porta: `apps/server/tests/billing-http.test.ts`

- [ ] **Step 1: Add failing tests for permit verification, replay rejection, receipt dispatch evidence, required/off modes, and reconciliation lookup.**
  - Prove invalid/mismatched permits cause zero upstream calls.
  - Prove the same attempt cannot execute twice.
  - Prove `tools/list` remains metadata-only.
  - Prove `attempt` callers can distinguish `failed_before_dispatch`, `started`, and `unknown`.
  - Prove trusted native metadata determines canonical identity, units are decimal strings, key rotation works, duplicate permits return the existing receipt, and Porta stores no wallet/customer fields.
- [ ] **Step 2: Run Porta focused tests and verify red.**
- [ ] **Step 3: Implement Ed25519 permit parser/verifier with key ID rotation and canonical JSON.**
- [ ] **Step 4: Extend `UsageMeter`/`UsageLedger` with operationId, attemptId, permit digest, dispatch evidence, and signed receipt snapshots.**
- [ ] **Step 5: Wire one middleware path through static registry and Native MCP `aroundCall`; do not add provider-specific billing code.**
- [ ] **Step 6: Add `PORTA_BILLING_MODE`, signing key, key ID, and reconciliation token parsing with strict validation.**
- [ ] **Step 7: Add internal receipt lookup with separate reconciliation authentication and redaction.**
- [ ] **Step 8: Add reconciliation worker primitives and startup pending-latch behavior.**
  - Receipt lookup may recover evidence; it must never invoke a provider or replay a business call.
- [ ] **Step 9: Run Porta billing, HTTP, native MCP, typecheck, boundaries, and lint tests.**
- [ ] **Step 10: Commit the Porta implementation.**

## Chunk 3: ChatNest persistence and platform adapter

**Files:**
- Modify ChatNest: `server/infrastructure/persistence/drizzle/schema.ts`
- Create ChatNest migration under `server/infrastructure/persistence/drizzle/migrations/`
- Create ChatNest: `server/domain/billing/repository.ts`
- Create ChatNest: `server/infrastructure/persistence/drizzle/billing-repository.ts`
- Create ChatNest: `server/application/platform/protocol.ts`
- Create ChatNest: `server/application/platform/client.ts`
- Create ChatNest: `server/application/platform/execution-gate.ts`
- Create ChatNest: `server/application/platform/account-access.ts`
- Create ChatNest: `server/application/platform/reconciliation-worker.ts`
- Modify ChatNest: `server/shared/env.ts`
- Create ChatNest test: `server/application/platform/platform-client.test.ts`
- Create ChatNest test: `server/infrastructure/persistence/drizzle/billing-repository.test.ts`
- Create ChatNest test: `server/application/platform/account-access.test.ts`

- [ ] **Step 1: Write failing tests for external identity/operation/attempt/receipt/outbox persistence and idempotent replay.**
  - Include lock order and ownership checks in repository contracts.
  - Include required Chinese table/column/index comments and migration `COMMENT ON` coverage.
  - Include verified subject mapping, connected access denial, and rejection of client-supplied userId/points/role.
- [ ] **Step 2: Run focused ChatNest tests and verify red.**
- [ ] **Step 3: Add schema types and migration with append-only ledger-facing snapshots, unique operation/attempt constraints, and outbox indexes.**
- [ ] **Step 4: Implement the platform HTTP adapter with strict Zod parsing, timeouts, no redirects, service/user credential separation, and idempotency headers.**
- [ ] **Step 5: Implement `ExecutionGate` for reserve/dispatch/report/reconcile and standalone `unmetered` mode.**
- [ ] **Step 5a: Bind standalone mode to immutable deployment mode/epoch.**
  - A connected deployment never falls back to unmetered when Payload is unavailable.
- [ ] **Step 5b: Implement cancel-before-dispatch release and post-dispatch reconcile behavior.**
- [ ] **Step 6: Add environment parsing for platform mode, base URL, deployment ID, service token, session encryption, and signing metadata.**
- [ ] **Step 7: Run focused tests, migration checks, typecheck, and offline checks.**
- [ ] **Step 8: Commit the ChatNest persistence/platform layer.**

## Chunk 4: ChatNest runtime AOP integration

**Files:**
- Modify ChatNest: `server/infrastructure/mcp/runtime.ts`
- Modify ChatNest: `server/application/chat/send-message.ts`
- Modify ChatNest: `server/composition.ts`
- Create ChatNest: `server/application/chat/tool-billing.ts`
- Create ChatNest test: `server/infrastructure/mcp/billing-runtime.test.ts`
- Modify ChatNest: `server/application/chat/send-message.test.ts`
- Modify ChatNest: `server/application/chat/porta-errors.test.ts`

- [ ] **Step 1: Write failing tests for a fixed Porta call, a metered call, metadata discovery, insufficient balance, permit mismatch, stop-before-send, stop-after-send, and concurrent tool calls.**
- [ ] **Step 1a: Add sequence assertions for local `ready → sending` CAS after dispatch and before `next()`.**
  - Prove CAS failure never calls `next()`.
  - Prove timeouts, receipt loss, and report loss never cause provider retry.
  - Prove model and tool operation IDs are distinct.
- [ ] **Step 2: Run focused tests and verify red.**
- [ ] **Step 3: Implement a generic `AroundCall<T>` decorator that creates operation/attempt IDs, calls `ExecutionGate`, and never invokes `next()` more than once.**
- [ ] **Step 4: Bind per-call permit context through transport fetch using `AsyncLocalStorage`; prove no concurrent permit leakage.**
- [ ] **Step 5: Preserve existing evidence ledger, approval, capability scope, source records, and result-table behavior.**
- [ ] **Step 6: Add model operation hooks with model billing disabled/included by default unless the platform returns an enabled model policy.**
- [ ] **Step 7: Run ChatNest focused agent tests, typecheck, and offline test whitelist.**
- [ ] **Step 8: Commit the runtime integration.**

## Chunk 5: Contract fixture and end-to-end closure

**Files:**
- Create ChatNest test-only fixture: `tests/support/platform-points-fixture.ts`
- Create ChatNest test-only fixture: `tests/support/platform-points-fixture-server.ts`
- Create ChatNest test: `tests/integration/platform-points-closure.test.ts`
- Create Porta test fixture changes only under `apps/server/tests/support/`
- Modify ChatNest: `docs/integrations/porta-host-verification.md` or create a new verification record
- Modify `docs/CODEBASE_MAP.md` only if production module structure changes

- [ ] **Step 1: Write failing end-to-end tests for login-shaped subject mapping, fixed tool charge, metered cap settlement, overage, unknown result, and report recovery.**
- [ ] **Step 1a: Add route-level contract cases for capabilities, identity register/login/refresh/logout/me, access, wallet, ledger, reserve, dispatch, report, get, cancel, and receipt lookup.**
- [ ] **Step 2: Run the fixture tests and verify red.**
- [ ] **Step 3: Implement a test-only platform HTTP fixture plus in-memory domain state; do not put mocks in production code.**
  - Exercise actual HTTP headers, serialization, idempotency, and independent service boundaries; keep in-memory helpers only for domain tests.
- [ ] **Step 4: Connect a synthetic Porta upstream and assert one upstream call, one receipt, and one platform ledger event per attempt.**
- [ ] **Step 5: Inject response loss, process restart, duplicate report, concurrent reserve, and stop races.**
- [ ] **Step 6: Run integration tests and record exact evidence; label all supplier data synthetic.**
- [ ] **Step 7: Commit fixture and verification documentation.**

## Chunk 6: Full verification and handoff

- [ ] **Step 1: Run ChatNest `corepack pnpm typecheck` and the explicit offline test whitelist.**
- [ ] **Step 2: Run Porta `corepack pnpm check` plus focused points/receipt tests.**
- [ ] **Step 3: Run lint, boundary checks, migration checks, and package tests in both worktrees.**
- [ ] **Step 4: Run the local browser/HTTP end-to-end path against isolated databases and synthetic upstreams.**
- [ ] **Step 4a: Run backup/restore and startup reconciliation tests; required outbound remains closed until pending operations are resolved.**
- [ ] **Step 4b: Run security tests for HTTPS/host/origin policy, service/user credential separation, no redirects, header redaction, replay, and scoped reconciliation token.**
- [ ] **Step 5: Review git diffs for secrets, `.env*`, `.local-review`, logs, screenshots, and production mocks.**
- [ ] **Step 6: Update lessons/verification docs with what passed, what remains blocked by the missing Payload repository, and what was not claimed.**
- [ ] **Step 7: Report commits, test commands, pass counts, and any external Payload acceptance gap.**

## Cross-repository execution rules

- Worktrees:
  - ChatNest: `/Users/nako/.config/superpowers/worktrees/chatnest/platform-points`
  - Porta: `/Users/nako/.config/superpowers/worktrees/porta/platform-points`
- Branch in both repositories: `codex/platform-points-closure`.
- Dependency order: contract artifacts → domain primitives → Porta AOP → ChatNest persistence/platform → ChatNest runtime → fixture E2E → full verification.
- Update `porta/docs/platform-points-contract.md` in the same change as permit/receipt behavior; do not silently diverge from the frozen architecture contract.
- Do not modify the frozen architecture document during implementation without a versioned architecture-review commit.
- The test-only platform fixture is not evidence that the real Payload service is deployed; final reporting must keep fixture acceptance separate from Payload acceptance.
- Permit expiry blocks dispatch/replay only; it never automatically releases a platform hold.

