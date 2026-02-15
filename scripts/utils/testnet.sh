#!/bin/sh

# Restart DB
docker compose down -v
docker compose up -d

sleep 2

# Push schema
DATABASE_URL=postgresql://bim_user:bim_password@localhost:5432/bim npm run db:push -w @bim/api

# Build and copy front
npm run build:testnet -w @bim/front
npm run copy:front -w @bim/api

# Start app
npm run start:dev -w @bim/api

# When using HTTPS, continue here

# In another terminal:
#npx local-ssl-proxy --source 8443 --target 8080 \
#     --cert scripts/utils/localhost.pem \
#     --key scripts/utils/localhost-key.pem

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
# --- Each dev session ---
#
#   # Terminal 1: start the app on HTTP :8080
#   npm run start -w @bim/api (last command above)
#
#   # Terminal 2: start the HTTPS proxy on :8443
#   npx local-ssl-proxy --source 8443 --target 8080 \
#     --cert scripts/utils/localhost.pem \
#     --key scripts/utils/localhost-key.pem
#
#   # Open https://localhost:8443 in your browser
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
