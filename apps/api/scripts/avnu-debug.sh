#!/usr/bin/env bash
# AVNU Paymaster diagnostic script
# Demonstrates why sponsored deploy fails: API key has zero credits.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.testnet"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

# Load AVNU config from .env.testnet
AVNU_API_URL=$(grep '^AVNU_API_URL=' "$ENV_FILE" | cut -d= -f2-)
AVNU_API_KEY=$(grep '^AVNU_API_KEY=' "$ENV_FILE" | cut -d= -f2-)

if [[ -z "$AVNU_API_URL" || -z "$AVNU_API_KEY" ]]; then
  echo "ERROR: AVNU_API_URL or AVNU_API_KEY not set in $ENV_FILE"
  exit 1
fi

echo "========================================"
echo " AVNU Paymaster Diagnostic"
echo "========================================"
echo ""
echo "URL:     $AVNU_API_URL"
echo "API Key: ${AVNU_API_KEY:0:8}..."
echo ""

# --- Test 1: Service availability ---
echo "--- 1. Service availability (paymaster_isAvailable) ---"
RESULT=$(curl -s "$AVNU_API_URL" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"paymaster_isAvailable","params":{},"id":1}')
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
echo ""

# --- Test 2: Sponsor activity (credits check) ---
NETWORK=$(echo "$AVNU_API_URL" | grep -oP '(sepolia|starknet)(?=\.paymaster)')
ACTIVITY_URL="https://${NETWORK}.api.avnu.fi/paymaster/v1/sponsor-activity"

echo "--- 2. Sponsor activity ($ACTIVITY_URL) ---"
RESULT=$(curl -s "$ACTIVITY_URL" -H "api-key: $AVNU_API_KEY")
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
echo ""

# Extract credits
CREDITS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('remainingCredits','?'))" 2>/dev/null || echo "?")
NAME=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name','?'))" 2>/dev/null || echo "?")

# --- Test 3: Sponsored deploy (the failing call) ---
echo "--- 3. Sponsored deploy (paymaster_executeTransaction) ---"
RESULT=$(curl -s "$AVNU_API_URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: */*' \
  -H "x-paymaster-api-key: $AVNU_API_KEY" \
  -d '{
    "jsonrpc":"2.0",
    "method":"paymaster_executeTransaction",
    "params":{
      "transaction":{
        "type":"deploy",
        "deployment":{
          "address":"0x0000000000000000000000000000000000000000000000000000000000000001",
          "class_hash":"0x04bc5b0950521985d3f8db954fc6ae3832122c6ee4cd770efdbf87437699ce48",
          "salt":"0x03",
          "calldata":["0x03"],
          "version":1
        }
      },
      "parameters":{
        "version":"0x1",
        "fee_mode":{"mode":"sponsored"}
      }
    },
    "id":1
  }')
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
echo ""

# --- Summary ---
echo "========================================"
echo " Summary"
echo "========================================"
echo ""
echo "Project:           $NAME"
echo "Remaining credits: $CREDITS"
echo ""
if [[ "$CREDITS" == "0x0" ]]; then
  echo "PROBLEM: API key '$NAME' has ZERO credits."
  echo "Sponsored mode (fee_mode: sponsored) requires credits > 0."
  echo "Error 163 = InvalidAPIKey (key valid but no credits = not authorized for sponsoring)."
  echo ""
  echo "FIX: Go to https://portal.avnu.fi, open your API key settings,"
  echo "     and add credits (free on Sepolia)."
else
  echo "Credits available. Sponsored mode should work."
  echo "If error 163 still occurs, the key may need additional portal configuration."
fi
