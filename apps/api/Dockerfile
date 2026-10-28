# syntax=docker/dockerfile:1
#
# TripTrackr API — Node.js 22 LTS.
#
# Build context is the REPOSITORY ROOT (see infra/docker-compose.yml), because
# the API depends on the workspace package @triptrackr/contracts. The root
# .dockerignore keeps the mobile app, docs, specs, and every .env out of the
# context, so nothing secret can be COPYed in by accident.

# --- 1. Dependency layer: only manifests, so it caches until they change --------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace apps/api --workspace packages/contracts --include-workspace-root=false

# --- 2. Build: contracts first (the API compiles against its dist) --------------
FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build --workspace packages/contracts \
 && npm run build --workspace apps/api

# --- 3. Runtime: production deps only, non-root, health-checked -------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
# --omit=peer: drizzle-orm's optional expo-sqlite peer (the mobile app's driver) pulled the whole Expo
# toolchain, 584 packages and its vulnerabilities, into this image. Everything the API needs is a
# direct dependency of apps/api (checked: the API, the worker and the migration runner all load).
RUN npm ci --omit=dev --omit=peer --workspace apps/api --workspace packages/contracts --include-workspace-root=false \
 && npm cache clean --force \
 # The runtime starts `node` directly (the API, the worker and the migration runner all do), so the
 # package managers the base image ships have no job here, and their own dependencies were the
 # source of most of the image scan's findings (npm's brace-expansion, pacote, sigstore, ...).
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
# The migration runner reads *.sql next to its compiled self.
COPY --from=build /repo/apps/api/src/db/migrations apps/api/dist/db/migrations

# Never runs as root.
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
