# syntax=docker/dockerfile:1.4

# Build stage
FROM node:22.12.0-slim AS builder

# Install pnpm globally
RUN npm install -g pnpm@10.15.1

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    python3-setuptools \
    make \
    g++ \
    libsqlite3-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build argument for GitHub token
ARG GITHUB_TOKEN

# Build argument for Starknet RPC URL
ARG STARKNET_RPC_URL

# Copy package files
COPY package.json pnpm-lock.yaml .npmrc ./

# Configure pnpm for GitHub Package Registry
RUN pnpm config set //npm.pkg.github.com/:_authToken ${GITHUB_TOKEN}

# Set environment variable for build
ENV STARKNET_RPC_URL=${STARKNET_RPC_URL}

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Rebuild native dependencies for production environment
RUN cd node_modules/.pnpm/sqlite3@5.1.7/node_modules/sqlite3 && \
    PYTHON=/usr/bin/python3 npx node-gyp rebuild

# Build the application
RUN pnpm run build:prod

# Production stage
FROM node:22.12.0-slim AS production

# Install pnpm globally
RUN npm install -g pnpm@10.15.1

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and registry config
COPY package.json pnpm-lock.yaml .npmrc ./

# Build argument for GitHub token (needed for production install)
ARG GITHUB_TOKEN
RUN pnpm config set //npm.pkg.github.com/:_authToken ${GITHUB_TOKEN}

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules/.pnpm/sqlite3@5.1.7/node_modules/sqlite3 ./node_modules/.pnpm/sqlite3@5.1.7/node_modules/sqlite3

# Copy additional required files
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY scripts ./scripts

# Create non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Set up pnpm home directory for the nodejs user
ENV PNPM_HOME=/app/.pnpm
RUN mkdir -p /app/.pnpm && chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health-simple', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["pnpm", "start"]