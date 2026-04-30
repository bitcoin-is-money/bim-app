# syntax=docker/dockerfile:1.4
# =============================================================================
# BIM API — Production Docker Image
# =============================================================================
# Fully-bundled build (esbuild). No external native modules: Atomiq SDK state
# is persisted via @bim/atomiq-storage-postgres (PgUnifiedStorage), pg is
# bundled into the esbuild output.
#
# Build:  docker build -f apps/api/Dockerfile -t bim-api .
# Run:    docker run -p 8080:8080 -e NETWORK=mainnet -e DATABASE_URL=... bim-api
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build everything
# -----------------------------------------------------------------------------
ARG NODE_VERSION
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

# Dependencies layers
COPY package.json package-lock.json ./
COPY patches/ patches/
COPY packages/lib/package.json packages/lib/
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY packages/test-toolkit/package.json packages/test-toolkit/
COPY apps/api/package.json apps/api/
COPY apps/front/package.json apps/front/
COPY apps/indexer/package.json apps/indexer/
RUN npm ci --ignore-scripts && npm exec patch-package --ignore-scripts

# Code layers — .dockerignore excludes node_modules, .env*, .git, dist, tests, docs
COPY . .

# Inject app version (git hash) into frontend build
ARG APP_VERSION=dev
RUN echo "export const APP_VERSION = '${APP_VERSION}';" > apps/front/src/environments/version.ts

RUN npm run build:api

# -----------------------------------------------------------------------------
# Stage 2: Production image
# -----------------------------------------------------------------------------
ARG NODE_VERSION
FROM node:${NODE_VERSION}-slim
WORKDIR /app

# Copy built API bundle (fully self-contained, pg bundled)
COPY --from=builder --chown=node:node --chmod=0444 /app/apps/api/dist/main.js ./dist/main.js

# Copy frontend static files
COPY --from=builder --chown=node:node --chmod=0555 /app/apps/api/public/app ./public/app

# Copy blockchain config (network constants only — no secrets, no infra values)
COPY --chown=node:node --chmod=0555 apps/api/config/ ./config/

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
