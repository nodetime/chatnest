#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Next and dotenv load these independently of process.env. Never read or remove
# them: use a fresh checkout instead of risking a developer's deployment data.
for config in .env .env.*; do
  if [[ -e "$config" && "$config" != .env.example ]]; then
    printf 'CI checks require a clean checkout without local environment files.\n' >&2
    exit 1
  fi
done

# Deliberate allowlist: no API tokens, DB URLs, NODE_OPTIONS or deployment config
# from the parent shell. In CI, linux-isolated-check.sh also denies external IPs.
clean=(env -i "PATH=$PATH" "HOME=$HOME" CI=1 NEXT_TELEMETRY_DISABLED=1)
case "${1:-}" in
  tests)
    tests=()
    while IFS= read -r file; do
      [[ -z "$file" || "$file" == \#* ]] && continue
      tests+=("$file")
    done < scripts/ci/offline-tests.txt
    exec "${clean[@]}" NODE_ENV=test pnpm exec tsx --conditions=react-server --test --test-concurrency=1 "${tests[@]}"
    ;;
  typecheck)
    exec "${clean[@]}" pnpm exec tsc --noEmit --incremental false
    ;;
  lint)
    exec "${clean[@]}" pnpm exec ultracite check
    ;;
  build)
    # Closed loopback endpoints are sentinels, not database/model services.
    # Build compilation must not migrate, discover tools or call providers.
    exec "${clean[@]}" NODE_ENV=production \
      AUTH_SECRET=ci-only-not-a-deployment-secret \
      AUTH_URL=http://127.0.0.1:3000 \
      POSTGRES_URL=postgres://ci:ci@127.0.0.1:9/chatnest_ci \
      MODEL_PROVIDER=openai OPENAI_API_KEY=ci-only-not-a-provider-key \
      OPENAI_BASE_URL=http://127.0.0.1:9/v1 OPENAI_MODEL=ci-local-fixture \
      pnpm exec next build --webpack
    ;;
  *)
    printf 'Usage: bash scripts/ci/offline-checks.sh {tests|typecheck|lint|build}\n' >&2
    exit 2
    ;;
esac
