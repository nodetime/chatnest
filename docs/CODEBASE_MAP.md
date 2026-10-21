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
