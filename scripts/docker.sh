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
    echo "Building images (version: $VERSION)"
    docker build -f "$PROJECT_ROOT/apps/api/Dockerfile" \
      --build-arg APP_VERSION="$VERSION" \
      -t "$REG/bim-api:$VERSION" \
      -t "$REG/bim-api:latest" \
      "$PROJECT_ROOT"
    docker build -f "$PROJECT_ROOT/apps/indexer/Dockerfile" \
      --build-arg APP_VERSION="$VERSION" \
      -t "$REG/bim-indexer:$VERSION" \
      -t "$REG/bim-indexer:latest" \
      "$PROJECT_ROOT"
    echo "Built: bim-api:$VERSION, bim-indexer:$VERSION"
    ;;

  push)
    REG=$(registry)
    VERSION=$(app_version)
    echo "Pushing images (version: $VERSION)"
    docker push "$REG/bim-api:$VERSION"
    docker push "$REG/bim-api:latest"
    docker push "$REG/bim-indexer:$VERSION"
    docker push "$REG/bim-indexer:latest"
    ;;

  redeploy)
    REG=$(registry)
    VERSION=$(app_version)
    API_ID=$(terraform -chdir="$INFRA_DIR" output -raw api_container_id)
    INDEXER_ID=$(terraform -chdir="$INFRA_DIR" output -raw indexer_container_id)
    echo "Deploying version $VERSION"
    scw container container update "${API_ID##*/}" registry-image="$REG/bim-api:$VERSION" region=fr-par
    scw container container deploy "${API_ID##*/}" region=fr-par
    scw container container update "${INDEXER_ID##*/}" registry-image="$REG/bim-indexer:$VERSION" region=fr-par
    scw container container deploy "${INDEXER_ID##*/}" region=fr-par
    ;;

  ship)
    "$0" build
    "$0" push
    "$0" redeploy
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
    echo "Usage: $0 {up|down|logs|build|push|redeploy|ship|plan|apply|init}"
    echo ""
    echo "Local Docker Compose:"
    echo "  up        Build images, start postgres + api + indexer, push schema"
    echo "  down      Stop all containers"
    echo "  logs      Follow container logs (pass service name to filter)"
    echo ""
    echo "Registry build & deploy (Scaleway):"
    echo "  build     Build images tagged with git hash + latest"
    echo "  push      Push images to Scaleway registry"
    echo "  redeploy  Update and redeploy Scaleway containers"
    echo "  ship      build + push + redeploy"
    echo ""
    echo "Terraform:"
    echo "  plan      terraform plan"
    echo "  apply     terraform apply"
    echo "  init      terraform init"
    exit 1
    ;;
esac
