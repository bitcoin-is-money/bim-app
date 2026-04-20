#!/bin/sh
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="$PROJECT_ROOT/infra"

# Load local environment (secrets not committed to git)
[ -f "$PROJECT_ROOT/.envrc" ] && . "$PROJECT_ROOT/.envrc"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

app_version() {
  git -C "$PROJECT_ROOT" rev-parse --short HEAD
}

# Single source of truth for the Node version used in Docker images.
# Mirrors .nvmrc (and .tool-versions) so local dev, CI, and production
# all run the exact same Node.
node_version() {
  cat "$PROJECT_ROOT/.nvmrc"
}

registry() {
  terraform -chdir="$INFRA_DIR" output -raw registry_endpoint
}

notify_deploy() {
  local services="${1:-all}"
  local version="$2"
  local token="${ALERTING_SLACK_BOT_TOKEN:-}"
  if [ -z "$token" ]; then
    echo "Warning: ALERTING_SLACK_BOT_TOKEN not set, skipping Slack notification" >&2
    return 0
  fi

  local response
  response=$(curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{
      \"channel\": \"#alerts\",
      \"text\": \":rocket: *Production deployed*\",
      \"attachments\": [{
        \"color\": \"#36a64f\",
        \"fields\": [
          {\"title\": \"Services\", \"value\": \"${services}\", \"short\": true},
          {\"title\": \"Version\", \"value\": \"${version}\", \"short\": true},
          {\"title\": \"By\", \"value\": \"$(git -C "$PROJECT_ROOT" config user.name)\", \"short\": true}
        ]
      }]
    }")

  if echo "$response" | grep -q '"ok":true'; then
    echo "Slack notification sent"
  else
    echo "Warning: Slack notification failed" >&2
  fi
}


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

case "${1:-}" in

  # --- Local Docker Compose ------------------------------------------------

  up)
    NETWORK="${NETWORK:-testnet}"
    DB_PORT="${DB_PORT:-5432}"
    VERSION=$(app_version)
    NODE_VER=$(node_version)

    echo "Starting full stack ($NETWORK, version $VERSION, node $NODE_VER)..."

    # Build images
    APP_VERSION="$VERSION" NODE_VERSION="$NODE_VER" NETWORK="$NETWORK" DB_PORT="$DB_PORT" \
      docker compose build

    # Start postgres and wait for readiness
    NETWORK="$NETWORK" DB_PORT="$DB_PORT" \
      docker compose up -d postgres
    echo "Waiting for PostgreSQL..."
    until docker compose exec postgres pg_isready -U bim_user -d bim > /dev/null 2>&1; do
      sleep 1
    done
    echo "PostgreSQL ready"

    # Push schema
    echo "Pushing database schema..."
    DATABASE_URL="postgresql://bim_user:bim_password@localhost:${DB_PORT}/bim" \
      npm run db:push -w @bim/db

    # Start remaining services
    APP_VERSION="$VERSION" NODE_VERSION="$NODE_VER" NETWORK="$NETWORK" DB_PORT="$DB_PORT" \
      docker compose up -d
    echo ""
    echo "All services started"
    echo "  API:      http://localhost:8080"
    echo "  Postgres: localhost:$DB_PORT"
    echo "  Network:  $NETWORK"
    ;;

  down)
    docker compose down
    ;;

  logs)
    shift
    docker compose logs -f "$@"
    ;;

  # --- Registry build & deploy (Scaleway) ----------------------------------

  build)
    REG=$(registry)
    VERSION=$(app_version)
    NODE_VER=$(node_version)
    SERVICE="${2:-all}"
    echo "Building images (version: $VERSION, node: $NODE_VER, service: $SERVICE)"
    export DOCKER_BUILDKIT=1
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "api" ]; then
      docker build -f "$PROJECT_ROOT/apps/api/Dockerfile" \
        --build-arg APP_VERSION="$VERSION" \
        --build-arg NODE_VERSION="$NODE_VER" \
        -t "$REG/bim-api:$VERSION" \
        -t "$REG/bim-api:latest" \
        "$PROJECT_ROOT"
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "indexer" ]; then
      docker build -f "$PROJECT_ROOT/apps/indexer/Dockerfile" \
        --build-arg APP_VERSION="$VERSION" \
        --build-arg NODE_VERSION="$NODE_VER" \
        -t "$REG/bim-indexer:$VERSION" \
        -t "$REG/bim-indexer:latest" \
        "$PROJECT_ROOT"
    fi
    echo "Build done (version: $VERSION, node: $NODE_VER, service: $SERVICE)"
    ;;

  push)
    REG=$(registry)
    VERSION=$(app_version)
    SERVICE="${2:-all}"
    echo "Pushing images (version: $VERSION, service: $SERVICE)"
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "api" ]; then
      docker push "$REG/bim-api:$VERSION"
      docker push "$REG/bim-api:latest"
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "indexer" ]; then
      docker push "$REG/bim-indexer:$VERSION"
      docker push "$REG/bim-indexer:latest"
    fi
    ;;

  redeploy)
    REG=$(registry)
    VERSION=$(app_version)
    SERVICE="${2:-all}"
    echo "Deploying version $VERSION (service: $SERVICE)"
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "api" ]; then
      API_ID=$(terraform -chdir="$INFRA_DIR" output -raw api_container_id)
      CURRENT_IMG=$(scw container container get "${API_ID##*/}" region=fr-par -o json | sed -n 's/.*"registry_image":"\([^"]*\)".*/\1/p')
      TARGET_IMG="$REG/bim-api:$VERSION"
      if [ "$CURRENT_IMG" = "$TARGET_IMG" ]; then
        echo "  api: already at version $VERSION, skipping"
      else
        scw container container update "${API_ID##*/}" registry-image="$TARGET_IMG" region=fr-par
      fi
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "indexer" ]; then
      INDEXER_ID=$(terraform -chdir="$INFRA_DIR" output -raw indexer_container_id)
      CURRENT_IMG=$(scw container container get "${INDEXER_ID##*/}" region=fr-par -o json | sed -n 's/.*"registry_image":"\([^"]*\)".*/\1/p')
      TARGET_IMG="$REG/bim-indexer:$VERSION"
      if [ "$CURRENT_IMG" = "$TARGET_IMG" ]; then
        echo "  indexer: already at version $VERSION, skipping"
      else
        scw container container update "${INDEXER_ID##*/}" registry-image="$TARGET_IMG" region=fr-par
      fi
    fi
    echo ""
    echo "--- Deploy done for version $VERSION (service: $SERVICE) ---"
    ;;

  ship)
    "$0" build "${2:-}"
    "$0" push "${2:-}"
    "$0" redeploy "${2:-}"
    notify_deploy "${2:-all}" "$(app_version)"
    ;;

  force-redeploy)
    SERVICE="${2:-all}"
    echo "Force redeploying (service: $SERVICE)..."
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "api" ]; then
      API_ID=$(terraform -chdir="$INFRA_DIR" output -raw api_container_id)
      scw container container deploy "${API_ID##*/}" region=fr-par
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "indexer" ]; then
      INDEXER_ID=$(terraform -chdir="$INFRA_DIR" output -raw indexer_container_id)
      scw container container deploy "${INDEXER_ID##*/}" region=fr-par
    fi
    echo "Force redeploy done."
    ;;

  # --- Terraform pass-through ----------------------------------------------

  plan)
    terraform -chdir="$INFRA_DIR" plan
    ;;

  apply)
    terraform -chdir="$INFRA_DIR" apply
    ;;

  init)
    terraform -chdir="$INFRA_DIR" init
    ;;

  *)
    echo "Usage: $0 {up|down|logs|build|push|redeploy|force-redeploy|ship|plan|apply|init} [api|indexer]"
    echo ""
    echo "Local Docker Compose:"
    echo "  up        Build images, start postgres + api + indexer, push schema"
    echo "  down      Stop all containers"
    echo "  logs      Follow container logs (pass service name to filter)"
    echo ""
    echo "Registry build & deploy (Scaleway):"
    echo "  build [api|indexer]     Build images tagged with git hash + latest"
    echo "  push [api|indexer]      Push images to Scaleway registry"
    echo "  redeploy [api|indexer]       Update and redeploy Scaleway containers"
    echo "  force-redeploy [api|indexer] Deploy without update (unstick transient state)"
    echo "  ship [api|indexer]           build + push + redeploy"
    echo ""
    echo "Terraform:"
    echo "  plan      terraform plan"
    echo "  apply     terraform apply"
    echo "  init      terraform init"
    exit 1
    ;;
esac
