# =============================================================================
# BIM API — Production Docker Image
# =============================================================================
# Fully-bundled build (esbuild). Only native module left external: sqlite3.
#
# Build:  docker build -f apps/api/Dockerfile -t bim-api .
# Run:    docker run -p 8080:8080 -e NETWORK=mainnet -e DATABASE_URL=... bim-api
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build everything
# -----------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

# Enable corepack to respect packageManager field (use npm version defined in package.json)
RUN corepack enable

# Build tools needed for sqlite3 native module (used by Atomiq SDK)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

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
RUN npm ci

# Code layers
COPY . .

# Inject app version (git hash) into frontend build
ARG APP_VERSION=dev
RUN echo "export const APP_VERSION = '${APP_VERSION}';" > apps/front/src/environments/version.ts

RUN npm run build:api

# Create minimal node_modules with only sqlite3 (the only external native dep)
WORKDIR /app/prod-deps
RUN echo '{"dependencies":{"sqlite3":"5.1.7"}}' > package.json && npm install --omit=dev

# -----------------------------------------------------------------------------
# Stage 2: Production image
# -----------------------------------------------------------------------------
FROM node:22-slim
WORKDIR /app

# Copy sqlite3 native module
COPY --from=builder /app/prod-deps/node_modules ./node_modules

# Copy built API bundle
COPY --from=builder /app/apps/api/dist/main.js ./dist/main.js

# Copy frontend static files
COPY --from=builder /app/apps/api/public/app ./public/app

# Copy blockchain config (network constants only — no secrets, no infra values)
COPY apps/api/config/ ./config/

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

EXPOSE 8080
CMD ["node", "dist/main.js"]
