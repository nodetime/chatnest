FROM node:22.23.4-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
ENV HUSKY=0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS migrator
COPY tsconfig.json ./
COPY server ./server
ENV NODE_ENV=production
USER node
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/infrastructure/persistence/drizzle/migrate.ts"]

FROM dependencies AS build
COPY . .
# Next evaluates route modules during build. Reuse CI's closed-loopback
# placeholders without baking any runtime configuration into the app image.
RUN --network=none bash scripts/ci/offline-checks.sh build

FROM base AS app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    UPLOAD_STORAGE_DIR=/var/lib/chatnest/uploads
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/server/infrastructure/skills ./server/infrastructure/skills
COPY --from=build /app/server/infrastructure/mcp/agent.json ./server/infrastructure/mcp/agent.json
COPY --from=build /app/server/infrastructure/uploads/document-worker.cjs ./server/infrastructure/uploads/document-worker.cjs
COPY --from=build /app/scripts/platform-settlement-worker.mjs /app/scripts/payment-recovery-result.mjs ./scripts/
COPY --from=build /app/scripts/generated/payment-recovery-schema.mjs ./scripts/generated/payment-recovery-schema.mjs
COPY --from=build /app/scripts/ci/production-gate.mjs ./scripts/ci/production-gate.mjs
RUN install -d -o node -g node -m 0700 /var/lib/chatnest/uploads .next/cache
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
