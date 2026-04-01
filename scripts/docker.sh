#!/bin/sh
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="$PROJECT_ROOT/infra"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

app_version() {
  git -C "$PROJECT_ROOT" rev-parse --short HEAD
}

registry() {
  terraform -chdir="$INFRA_DIR" output -raw registry_endpoint
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

    echo "Starting full stack ($NETWORK, version $VERSION)..."

    # Build images
    APP_VERSION="$VERSION" NETWORK="$NETWORK" DB_PORT="$DB_PORT" \
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
    APP_VERSION="$VERSION" NETWORK="$NETWORK" DB_PORT="$DB_PORT" \
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
    SERVICE="${2:-all}"
    echo "Building images (version: $VERSION, service: $SERVICE)"
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "api" ]; then
      docker build -f "$PROJECT_ROOT/apps/api/Dockerfile" \
        --build-arg APP_VERSION="$VERSION" \
        -t "$REG/bim-api:$VERSION" \
        -t "$REG/bim-api:latest" \
        "$PROJECT_ROOT"
    fi
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "indexer" ]; then
      docker build -f "$PROJECT_ROOT/apps/indexer/Dockerfile" \
        --build-arg APP_VERSION="$VERSION" \
        -t "$REG/bim-indexer:$VERSION" \
        -t "$REG/bim-indexer:latest" \
        "$PROJECT_ROOT"
    fi
    echo "Build done (version: $VERSION, service: $SERVICE)"
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
    set +e
    if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "api" ]; then
      API_ID=$(terraform -chdir="$INFRA_DIR" output -raw api_container_id)
      CURRENT_IMG=$(scw container container get "${API_ID##*/}" region=fr-par -o json | sed -n 's/.*"registry_image":"\([^"]*\)".*/\1/p')
      TARGET_IMG="$REG/bim-api:$VERSION"
      if [ "$CURRENT_IMG" = "$TARGET_IMG" ]; then
        echo "  api: already at version $VERSION, skipping"
      else
        scw container container update "${API_ID##*/}" registry-image="$TARGET_IMG" region=fr-par
        scw container container deploy "${API_ID##*/}" region=fr-par
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
        scw container container deploy "${INDEXER_ID##*/}" region=fr-par
      fi
    fi
    set -e
    echo ""
    echo "--- Deploy done for version $VERSION (service: $SERVICE) ---"
    ;;

  ship)
    "$0" build "${2:-}"
    "$0" push "${2:-}"
    "$0" redeploy "${2:-}"
    ;;

  force-redeploy)
    SERVICE="${2:-all}"
    echo "Force redeploying (service: $SERVICE)..."
    echo "This skips 'update' and sends 'deploy' directly to unstick transient states."
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
