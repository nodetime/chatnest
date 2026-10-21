# Standard administration template integration

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
