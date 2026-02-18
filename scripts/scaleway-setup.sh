#!/usr/bin/env bash
# =============================================================================
# Scaleway Infrastructure Setup
# =============================================================================
# One-time setup script to create all Scaleway resources for BIM.
# Requires: scw CLI configured (scw init), jq
#
# Usage: ./scripts/scaleway-setup.sh
#
# Creates:
#   1. Container Registry namespace
#   2. Serverless SQL Database (PostgreSQL)
#   3. Serverless Containers namespace
#   4. API container
#   5. Indexer container
#
# Outputs the IDs and URLs needed for GitHub Actions secrets.
# =============================================================================

set -euo pipefail

REGION="fr-par"
REGISTRY_NAME="bim"
DB_NAME="bim"
CONTAINER_NS_NAME="bim"
API_CONTAINER_NAME="bim-api"
INDEXER_CONTAINER_NAME="bim-indexer"

echo "=== BIM Scaleway Infrastructure Setup ==="
echo ""

# ---- 1. Container Registry ----
echo "--- Creating Container Registry namespace..."
REGISTRY_JSON=$(scw registry namespace create name="$REGISTRY_NAME" is-public=false region="$REGION" -o json)
REGISTRY_ENDPOINT=$(echo "$REGISTRY_JSON" | jq -r '.endpoint')
REGISTRY_ID=$(echo "$REGISTRY_JSON" | jq -r '.id')
echo "  Registry ID:       $REGISTRY_ID"
echo "  Registry endpoint: $REGISTRY_ENDPOINT"
echo ""

# ---- 2. Serverless SQL Database ----
echo "--- Creating Serverless SQL Database..."
DB_JSON=$(scw sdb-sql database create name="$DB_NAME" cpu-min=0 cpu-max=4 region="$REGION" -o json)
DB_ID=$(echo "$DB_JSON" | jq -r '.id')
DB_ENDPOINT=$(echo "$DB_JSON" | jq -r '.endpoint')
echo "  Database ID:       $DB_ID"
echo "  Database endpoint: $DB_ENDPOINT"
echo ""

# ---- 3. Serverless Containers namespace ----
echo "--- Creating Serverless Containers namespace..."
NS_JSON=$(scw container namespace create name="$CONTAINER_NS_NAME" region="$REGION" -o json)
NS_ID=$(echo "$NS_JSON" | jq -r '.id')
echo "  Namespace ID: $NS_ID"
echo ""

# ---- 4. API Container ----
echo "--- Creating API container (will fail to start until image is pushed)..."
API_JSON=$(scw container container create \
  namespace-id="$NS_ID" \
  name="$API_CONTAINER_NAME" \
  registry-image="${REGISTRY_ENDPOINT}/bim-api:latest" \
  port=8080 \
  min-scale=1 \
  max-scale=2 \
  memory-limit=512 \
  cpu-limit=500 \
  privacy=public \
  http-option=redirected \
  deploy=false \
  region="$REGION" \
  -o json)
API_CONTAINER_ID=$(echo "$API_JSON" | jq -r '.id')
API_DOMAIN=$(echo "$API_JSON" | jq -r '.domain_name')
echo "  API container ID: $API_CONTAINER_ID"
echo "  API domain:       https://$API_DOMAIN"
echo ""

# ---- 5. Indexer Container ----
echo "--- Creating Indexer container..."
INDEXER_JSON=$(scw container container create \
  namespace-id="$NS_ID" \
  name="$INDEXER_CONTAINER_NAME" \
  registry-image="${REGISTRY_ENDPOINT}/bim-indexer:latest" \
  port=8080 \
  min-scale=1 \
  max-scale=1 \
  memory-limit=512 \
  cpu-limit=500 \
  privacy=private \
  deploy=false \
  region="$REGION" \
  -o json)
INDEXER_CONTAINER_ID=$(echo "$INDEXER_JSON" | jq -r '.id')
echo "  Indexer container ID: $INDEXER_CONTAINER_ID"
echo ""

# ---- Summary ----
echo "==========================================="
echo "  Setup complete!"
echo "==========================================="
echo ""
echo "GitHub Actions secrets to configure:"
echo ""
echo "  SCW_SECRET_KEY          = <your Scaleway secret key>"
echo "  SCW_PROJECT_ID          = $(scw config get default-project-id 2>/dev/null || echo '<your project ID>')"
echo "  SCW_REGISTRY_ENDPOINT   = $REGISTRY_ENDPOINT"
echo "  SCW_API_CONTAINER_ID    = $API_CONTAINER_ID"
echo "  SCW_INDEXER_CONTAINER_ID = $INDEXER_CONTAINER_ID"
echo "  DATABASE_URL            = $DB_ENDPOINT"
echo ""
echo "Container environment variables to configure (via scw container container update):"
echo ""
echo "  API:     NETWORK, DATABASE_URL, DATABASE_SSL, AVNU_API_KEY,"
echo "           WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN"
echo "  Indexer: APIBARA_RUNTIME_CONFIG (JSON with connectionString), DNA_TOKEN, PRESET"
echo ""
echo "Example (set API env vars):"
echo "  scw container container update $API_CONTAINER_ID \\"
echo "    environment-variables.NETWORK=mainnet \\"
echo "    environment-variables.DATABASE_SSL=require \\"
echo "    environment-variables.WEBAUTHN_RP_ID=$API_DOMAIN \\"
echo "    environment-variables.WEBAUTHN_ORIGIN=https://$API_DOMAIN \\"
echo "    secret-environment-variables.0.key=DATABASE_URL \\"
echo "    secret-environment-variables.0.value=\"\$DATABASE_URL\" \\"
echo "    secret-environment-variables.1.key=AVNU_API_KEY \\"
echo "    secret-environment-variables.1.value=\"\$AVNU_API_KEY\""
echo ""
echo "Example (set Indexer env vars):"
echo "  scw container container update $INDEXER_CONTAINER_ID \\"
echo "    environment-variables.PRESET=mainnet \\"
echo "    secret-environment-variables.0.key=APIBARA_RUNTIME_CONFIG \\"
echo "    secret-environment-variables.0.value='{\"connectionString\":\"\$DATABASE_URL\"}' \\"
echo "    secret-environment-variables.1.key=DNA_TOKEN \\"
echo "    secret-environment-variables.1.value=\"\$DNA_TOKEN\""
