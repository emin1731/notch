# syntax=docker/dockerfile:1
# The production image: the API, plus the web app's static files on the same origin (plan 12.4).

ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS base
# OpenSSL for Prisma's schema engine (migrations), which also picks its engine build by it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.18.0 && npm cache clean --force
ENV PNPM_HOME=/pnpm CI=true

FROM base AS build
WORKDIR /repo
# Manifests first, so the dependency layer is reused until they change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json .npmrc* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo run build --filter=@notch/api...
# A self-contained folder with production dependencies only, @notch/shared included.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @notch/api deploy --prod /out

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 WEB_DIST_DIR=/app/static
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
