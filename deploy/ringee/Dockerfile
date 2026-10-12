# syntax=docker/dockerfile:1
# Pinned glibc base: Temporal native worker requires glibc, not Alpine musl.
ARG NODE_IMAGE=node:22-bookworm@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0
RUN corepack enable
COPY . .
RUN test -f packages/database/prisma/migrations/20261011000000_fresh_install_baseline/migration.sql
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ringee/database prisma:generate

FROM dependencies AS server-build
RUN pnpm --filter backend... --filter @ringee/orchestrator... build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/packages ./packages
COPY --from=server-build /app/apps/backend ./apps/backend
COPY --from=server-build /app/apps/orchestrator ./apps/orchestrator
COPY --from=server-build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["node", "apps/backend/dist/apps/backend/src/main.js"]

FROM dependencies AS frontend-build
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_ENV=production \
    NEXT_PUBLIC_API_BASE_URL=https://calls-api.connectxmedia.com \
    NEXT_PUBLIC_API_URL=https://calls-api.connectxmedia.com/api \
    NEXT_PUBLIC_SITE_URL=https://calls.connectxmedia.com \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/sign-in \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/sign-up \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/overview \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard/overview \
    NEXT_PUBLIC_SENTRY_DISABLED=true \
    NEXT_PUBLIC_TELNYX_LOGIN= \
    NEXT_PUBLIC_TELNYX_PASSWORD= \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter frontend build

FROM ${NODE_IMAGE} AS frontend
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4200 HOSTNAME=0.0.0.0
COPY --from=frontend-build /app/apps/frontend/.next/standalone ./
COPY --from=frontend-build /app/apps/frontend/public ./apps/frontend/public
COPY --from=frontend-build /app/apps/frontend/.next/static ./apps/frontend/.next/static
RUN mkdir -p apps/frontend/.next/cache && chown -R node:node apps/frontend
USER node
EXPOSE 4200
CMD ["node", "apps/frontend/server.js"]
