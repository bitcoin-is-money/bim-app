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
FROM node:22-slim AS builder
WORKDIR /app

# Enable corepack to respect packageManager field (use npm version defined in package.json)
RUN corepack enable

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
RUN npm run build:indexer

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:22-slim
WORKDIR /app

# Install pg (only external dependency needed by the Apibara bundle)
RUN npm init -y && npm install pg

# Copy Apibara build output
COPY --from=builder /app/apps/indexer/.apibara/build/ ./.apibara/build/

# Copy bundled entrypoint (health server)
COPY --from=builder /app/apps/indexer/dist/entrypoint.mjs ./entrypoint.mjs

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

EXPOSE 8080
CMD ["node", "entrypoint.mjs"]
