# Standard administration template integration

**Status: Task 2.5 accepted (2026-10-21).** Document ingestion/parsing and result tables remain separate pending work. Storage remains local-only.

**User correction:** the current centered configuration page is not a standard product administration console. Use an existing Vercel-listed Next/shadcn dashboard template instead of inventing another layout.

## Reference and source provenance

- Vercel listing: https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard
- Upstream: https://github.com/arhamkhnz/next-shadcn-admin-dashboard
- Inspected commit: `487a741538e787113f24a6c291f606136e2a970a`
- License: MIT, Copyright (c) 2024 Mohammed Arham Khan. Preserve full license and upstream/source commit in THIRD_PARTY_NOTICES or a dedicated notice when adapting substantial template components.
- Local read-only snapshot: ignored `.local-review/admin-template-reference` (do not vendor whole repository/dependencies/demo data).
- Applicable upstream files: `src/app/(main)/dashboard/layout.tsx`, `_components/sidebar/app-sidebar.tsx`, `nav-main.tsx`, `nav-user.tsx`, UI card/table/breadcrumb as needed.
- This is a Vercel template-market listing by its upstream author, not a claim of Vercel-authored RBAC/backend. Keep our actual server authorization; upstream RBAC roadmap/demo users must not become permissions.

## Implementation slice (after private upload writer handoff)

1. Template-derived full-height SidebarProvider/SidebarInset shell, collapsible desktop sidebar, accessible mobile Sheet, compact top header with actual breadcrumb/page location, current signed-in admin identity and return-to-workbench. Existing neutral shadcn tokens; no global theme/font rewrite. Scope admin only.
2. Navigation only real pages: overview `/admin`, tool connections `/admin/connections`, file storage `/admin/storage`. Exact active styles/aria-current, no inert fake users/billing/log charts/menus. No dummy notification counters or environment selectors.
3. Overview has actual lightweight service/readiness summaries and links, not fabricated revenue/activity charts. Use existing independently guarded data services; model name/status read-only (never API keys). Failures isolated per card. Overview page data independently authorized, not merely trusting layout.
4. Tool connections use standard data-table/list pattern: clear name, connection type/source, enabled state, open tools count, available actions. Retain working official endpoint/native tool schema import/test, secret masking, explicit admin controls and every API auth/Origin. Reuse existing service/editor logic, adapt editor to standard side Sheet where appropriate; no duplicate connection service.
5. Storage uses standard labeled status/configuration cards and primary actions, clear supported formats/limits, actual test result, enable/disable and cleanup. Deployment path/technical constraints behind collapsible details. Reuse real existing API; no fake selectable cloud provider/no invented metrics. Task3 extends file capability text later.
6. All settings remain separate from personal settings. Server AdminGate stays under Suspense; every API remains independent. Template client layout receives only authorized presentation props, never secrets/client role overrides.
7. Tests first for active navigation/layout/identity and no dummy demos, real MCP controls and storage. Root actual desktop+narrow browser and three-role route/API matrix; focused unit/type/lint/production build. Preserve attribution, no template package scripts run or whole framework replacement.

## Implementation handoff

- Implemented all six scoped UI/API items without additional dependencies, global theme changes, fake demo data, model calls or new storage drivers.
- Template adaptation is recorded with full upstream MIT license and exact source commit in `THIRD_PARTY_NOTICES.md`.
- Test-first regressions cover shell/identity, exact active route (including `/demo`), real MCP table/action wiring, storage cards/actions, independent overview auth/error isolation, configuration counts, three-card-only overview and breadcrumb text semantics. Updated old render assertions only for the new identity/context/table contracts; authorization assertions remain intact.
- Writer verification: 109/109 focused offline tests, `tsc --noEmit --incremental false`, targeted Biome on 17 source/test files plus the three new UI primitives (explicit temporary config to include the otherwise excluded UI directory), and `git diff --check`. No migration/build wrapper, writer-side real DB write or vendor/model request. A scoped local commit was authorized only after independent acceptance; no push.
- Independent spec review and quality review approved after the busy-dismiss fix. The quality reviewer separately ran 45 safe tests and TypeScript. Root acceptance evidence is summarized below; paid supplier/model acceptance is not claimed.

### Spec-review follow-up

The MCP drawer now blocks close-button/Escape/outside/cancel dismissal while discovery, saving or conflict refresh is pending. A synchronous busy ref covers the event-to-render gap. The mounted editor owns a cancellable operation lifetime; unmount aborts transport and invalidates all late success/error/saved/conflict/finally callbacks, including Strict Mode reactivation. Cancellation does not imply that a server-side save transaction was rolled back. Two additional regressions were observed RED before implementation and are included in the 109-test writer verification above.

## Root acceptance verification

- Root independently reran all 109 focused offline tests, TypeScript, targeted Biome on 17 non-UI files and diff checks.
- Actual desktop 1360×900 and mobile 390×844 browser checks passed without horizontal document overflow; mobile navigation opened and dismissed after route selection.
- Actual MCP keep-secret editing discovered two native tools through the local fixture, saved successfully and returned to the real table without exposing saved secrets. With a 5000 ms delayed discovery response, Escape stayed blocked, cancel stayed disabled and X was hidden; controls recovered after completion.
- Actual storage UI write/read/delete probe passed. The independent 18-check role/page/API matrix passed.
- A clean source copy passed actual `next build --webpack` and `next start`; production admin storage page returned 200, actual private write/read/delete passed, overview denied ordinary/guest accounts with 403, cross-origin storage test returned 403 and responses exposed no secrets. The overview production file trace retained `config/agent.json`.
- The production tools card correctly rejected the development-only HTTP fixture configuration, while storage and model cards remained available. This demonstrates per-card isolation, not paid vendor connectivity, model execution or cloud-storage compatibility.
- Root evidence stays ignored: `.local-review/admin-template-{http,browser,production}-evidence.json` and build logs. No paid supplier/model calls were made.

Accepted scope is the standard administration UI, read-only readiness and retained local/MCP management paths. Document parsing, result tables and any future cloud adapter/migration remain pending separately.
