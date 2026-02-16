#!/bin/bash
set -e

# =============================================================================
# Local development server with PostgreSQL + HTTPS proxy
#
# Usage:
#   ./scripts/local.sh [testnet|mainnet]
#   npm run local:testnet
#   npm run local:mainnet
#
# Ports:
#   testnet → DB :5432, HTTPS :8443
#   mainnet → DB :5433, HTTPS :8444
#
# Data stored in ./data/{network}/pgdata (gitignored)
# =============================================================================

NETWORK="${1:-testnet}"

if [[ "$NETWORK" != "testnet" && "$NETWORK" != "mainnet" ]]; then
  echo "Usage: $0 [testnet|mainnet]"
  exit 1
fi

if [[ "$NETWORK" == "testnet" ]]; then
  DB_PORT=5432
  HTTPS_PORT=8443
else
  DB_PORT=5433
  HTTPS_PORT=8444
fi

# -- Start PostgreSQL ---------------------------------------------------------

echo "[$NETWORK] Starting PostgreSQL (port $DB_PORT)..."
DB_PORT=$DB_PORT NETWORK=$NETWORK docker compose up -d
sleep 2

# -- Push schema --------------------------------------------------------------

echo "[$NETWORK] Pushing database schema..."
DATABASE_URL="postgresql://bim_user:bim_password@localhost:$DB_PORT/bim" \
  npm run db:push -w @bim/api

# -- Build frontend -----------------------------------------------------------

echo "[$NETWORK] Building frontend..."
if npm run --workspace @bim/front --if-present "build:$NETWORK" 2>/dev/null; then
  : # network-specific build succeeded
else
  npm run build -w @bim/front
fi
npm run copy:front -w @bim/api

# -- Trap Ctrl+C → clean shutdown --------------------------------------------

cleanup() {
  echo ""
  echo "Stopping..."
  kill "$PID_APP" "$PID_PROXY" 2>/dev/null
  wait "$PID_APP" "$PID_PROXY" 2>/dev/null
}
trap cleanup EXIT INT TERM

# -- Start API server ---------------------------------------------------------

echo "[$NETWORK] Starting API..."
DATABASE_PORT=$DB_PORT npm run "dev:$NETWORK" -w @bim/api &
PID_APP=$!

# -- Start HTTPS proxy --------------------------------------------------------

npx local-ssl-proxy --source "$HTTPS_PORT" --target 8080 \
  --cert scripts/utils/localhost.pem \
  --key scripts/utils/localhost-key.pem &
PID_PROXY=$!

echo ""
echo "Ready → https://localhost:$HTTPS_PORT ($NETWORK)"
echo "Press Ctrl+C to stop."
wait



# =============================================================================
# HTTPS with real WebAuthn (passkeys via KeePassXC, YubiKey, etc.)
# =============================================================================
#
# On Linux, browsers only allow third-party passkey providers (like KeePassXC)
# on HTTPS origins. localhost over HTTP won't work — the browser shows its own
# "Touch your security key" dialog instead of letting the extension intercept.
#
# Solution: use mkcert to generate locally-trusted certificates, then run an
# HTTPS proxy in front of the app.
#
# --- One-time setup ---
#
#   # Install mkcert and the NSS tools (required for Firefox)
#   sudo apt install mkcert libnss3-tools   # Debian/Ubuntu
#   brew install mkcert                      # macOS
#
#   # Create and install a local Certificate Authority
#   mkcert -install
#
#   # Generate trusted certificates for localhost (in this directory)
#   cd scripts/utils
#   mkcert localhost
#   # → creates localhost.pem and localhost-key.pem (gitignored)
#
#   # Restart your browser(s) to pick up the new CA
#
# --- KeePassXC browser extension checklist ---
#
#   1. KeePassXC app: Settings → Browser Integration → Enable browser integration
#   2. Browser extension: Settings → Enable Passkeys (disabled by default!)
#   3. Extension must have site access for https://localhost:8443
#   4. Extension icon should be colored (connected) on the page
#
# --- Notes ---
#
#   - Each developer must run mkcert -install on their own machine
#   - Do NOT commit localhost.pem / localhost-key.pem (they are gitignored)
#   - The private key is specific to your local CA and useless to others
#

