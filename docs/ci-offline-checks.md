# Isolated CI checks

PRs targeting `main`/`master` and pushes to those branches run:

- **Lint / build**: the existing full-repository Ultracite check (not diff-only).
- **Offline checks / tests**: the reviewed, explicit serial regression manifest in `scripts/ci/offline-tests.txt`, including runtime interaction behavior. Fake models, mocked boundaries and loopback HTTP fixtures are used; this is not a browser E2E job.
- **Offline checks / typecheck**: TypeScript with no emit and no incremental cache.
- **Offline checks / build**: `pnpm exec next build --webpack` directly, matching the independently verified production build path. The package's `pnpm build` also executes database migrations and is deliberately not used.

All jobs pin Node **24.20.0**, pnpm **10.32.1**, Ubuntu **24.04** and install the frozen lockfile. The safety helper has its own Node contract tests. Full lint passed on the pre-interaction baseline; no lint rules or file coverage were relaxed for this change.

## Isolation boundary

Dependency installation is the only network-enabled setup phase. It receives no deployment secrets; checkout credentials are not persisted. Checks execute inside a fresh Linux network namespace with **only loopback** enabled, then drop root back to the runner user. External/public and private-network access is denied at the OS boundary, including native workers and subprocesses. Namespace creation failure fails the job rather than silently falling back to network-enabled execution.

The check helper starts each command with an environment allowlist. It does not inherit database URLs, model/MCP credentials, `NODE_OPTIONS`, or cloud tokens. It rejects any root `.env`/`.env.*` file except `.env.example`, without reading or deleting it. Next/dotenv would otherwise reload developer credentials after environment clearing.

Build-only auth/model/database values are non-secret sentinels. Model and Postgres endpoints point to closed loopback port 9; Redis is unset. There are **no migrations and no database/Redis services** in these checks: neither offline unit regressions nor compilation require persistence. Future persistence acceptance must introduce a disposable isolated database with fixture migrations rather than using deployment configuration.

This isolates accidental application traffic, not hostile repository code from the GitHub-hosted runner itself. Do not add secrets, `pull_request_target`, deployment environments, or privileged persistent self-hosted runners to these workflows.

## Reproducing checks

Use a fresh checkout without local environment files and the pinned toolchain:

```sh
pnpm install --frozen-lockfile
node --test scripts/ci/offline-checks.test.mjs
bash scripts/ci/offline-checks.sh lint
bash scripts/ci/offline-checks.sh tests
bash scripts/ci/offline-checks.sh typecheck
bash scripts/ci/offline-checks.sh build
```

On Linux with `sudo`, `unshare`, `ip`, and `runuser`, replace `offline-checks.sh` with `linux-isolated-check.sh` for the same OS-level network boundary used in CI. The portable helper clears configuration but by itself does **not** restrict network traffic. Never substitute a broad test glob or `pnpm test` for the reviewed manifest.

## Coverage and remaining browser work

The removed workflow named “Playwright Tests” explicitly populated production deployment secrets. Its `pnpm test` command loaded `.env.local` through the old Playwright config, started a development server without isolated database fixtures/migrations, and used outdated UI assumptions such as `suggested-actions` and English `Search models...`. Those tests do not currently establish the requested runtime acceptance.

`server/agent/browser-runtime.test.ts` (real external browser navigation) and `server/db/regeneration-db.test.ts` (dotenv-loaded real Postgres) are intentionally absent from the offline manifest. New offline suites must be reviewed and added explicitly, not swept in via a wildcard.

Browser/HTTP fixture verification for runtime interactions remains separately recorded by the root acceptance run under the runtime-interactions plan. Passing these CI jobs alone does **not** claim approval/denial/stop/recovery in a real browser, real provider acceptance, or durable database correctness. A future browser CI job must port the current deterministic fixture and use disposable storage, loopback model/MCP endpoints and maintained selectors before being called Playwright coverage.

Branch protection administrators should review any existing required check named after the removed Playwright job and configure the new checks through normal repository administration. Never bypass branch protection or label the offline job “Playwright” merely to satisfy an obsolete required check.
