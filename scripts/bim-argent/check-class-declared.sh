#!/usr/bin/env bash
# Check if Starknet contract class hashes are declared on target networks.
set -euo pipefail

# --- Configuration ---

# BIM Argent 0.5.0 — Modified Argent wallet contract that validates transactions
# via WebAuthn (passkey/biometrics) instead of traditional STARK signatures.
# This class hash must be declared on every network where accounts will be deployed.
ACCOUNT_CLASS_HASH="0x04bc5b0950521985d3f8db954fc6ae3832122c6ee4cd770efdbf87437699ce48"

SEPOLIA_RPC="https://api.cartridge.gg/x/starknet/sepolia"
MAINNET_RPC="https://api.cartridge.gg/x/starknet/mainnet"

# --- Functions ---

check_class_declared() {
  local class_hash="$1"
  local rpc_url="$2"
  local network_label="$3"

  echo "[$network_label] Checking class hash: $class_hash"

  local response
  response=$(curl -s --fail-with-body "$rpc_url" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"starknet_getClass\",
      \"params\": {
        \"block_id\": \"latest\",
        \"class_hash\": \"$class_hash\"
      },
      \"id\": 1
    }") || { echo "[$network_label] FAIL - Could not reach RPC endpoint"; return 2; }

  if echo "$response" | grep -qi '"sierra_program"\|"abi"'; then
    echo "[$network_label] OK - Declared"
    return 0
  elif echo "$response" | grep -qi 'not found\|CLASS_HASH_NOT_FOUND'; then
    echo "[$network_label] NOT FOUND - Class hash is not declared"
    return 1
  else
    echo "[$network_label] UNEXPECTED - $(echo "$response" | head -c 300)"
    return 2
  fi
}

print_summary() {
  local label="$1"
  local status="$2"

  case "$status" in
    0) results+=("  $label: OK") ;;
    1) results+=("  $label: NOT FOUND"); has_failure=1 ;;
    *)  results+=("  $label: ERROR"); has_failure=1 ;;
  esac
}

# --- Main ---

main() {
  local results=()
  local has_failure=0

  echo "=== Starknet Class Hash Declaration Check (BIM Argent 0.5.0 smart contract) ==="
  echo ""

  local status=0

  check_class_declared "$ACCOUNT_CLASS_HASH" "$SEPOLIA_RPC" "sepolia" || status=$?
  print_summary "sepolia" "$status"

  echo ""
  status=0

  check_class_declared "$ACCOUNT_CLASS_HASH" "$MAINNET_RPC" "mainnet" || status=$?
  print_summary "mainnet" "$status"

  exit "$has_failure"
}

main
