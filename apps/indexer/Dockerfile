# syntax=docker/dockerfile:1.4
# =============================================================================
# BIM Indexer — Production Docker Image
# =============================================================================
# Apibara bundles everything except pg (PostgreSQL client).
#
# Build:  docker build -f apps/indexer/Dockerfile -t bim-indexer .
# Run:    docker run -p 8080:8080 -e DATABASE_URL=... -e DNA_TOKEN=... bim-indexer
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
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
RUN npm ci --ignore-scripts && node_modules/.bin/patch-package

# Code layers — .dockerignore excludes node_modules, .env*, .git, dist, tests, docs
COPY . .
RUN npm run build:indexer

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
ARG NODE_VERSION
FROM node:${NODE_VERSION}-slim
WORKDIR /app

# Install pg (only external dependency needed by the Apibara bundle).
# pg is externalized from the bundle because it uses dynamic require() (notably
# for the optional pg-native binding), which esbuild/Apibara cannot resolve
# statically. Version pinned for reproducible builds — keep in sync with
# package-lock.json.
RUN echo '{"dependencies":{"pg":"8.20.0"}}' > package.json && npm install --ignore-scripts && chown -R node:node /app

# Copy Apibara build output
COPY --from=builder --chown=node:node --chmod=0555 /app/apps/indexer/.apibara/build/ ./.apibara/build/

# Copy bundled entrypoint (health server)
COPY --from=builder --chown=node:node --chmod=0444 /app/apps/indexer/dist/entrypoint.mjs ./entrypoint.mjs

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

USER node
EXPOSE 8080
CMD ["node", "entrypoint.mjs"]
