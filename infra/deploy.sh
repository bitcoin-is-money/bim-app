#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INFRA_DIR="$SCRIPT_DIR"

registry() {
  terraform -chdir="$INFRA_DIR" output -raw registry_endpoint
}

case "${1:-}" in
  build)
    REG=$(registry)
    APP_VERSION=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)
    docker build -f "$PROJECT_ROOT/apps/api/Dockerfile"     --build-arg APP_VERSION="$APP_VERSION"  -t "$REG/bim-api:$APP_VERSION" -t "$REG/bim-api:latest"           "$PROJECT_ROOT"
    docker build -f "$PROJECT_ROOT/apps/indexer/Dockerfile"  --build-arg APP_VERSION="$APP_VERSION"  -t "$REG/bim-indexer:$APP_VERSION" -t "$REG/bim-indexer:latest"   "$PROJECT_ROOT"
    ;;
  push)
    REG=$(registry)
    APP_VERSION=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)
    docker push "$REG/bim-api:$APP_VERSION"
    docker push "$REG/bim-indexer:$APP_VERSION"
    ;;
  redeploy)
    REG=$(registry)
    APP_VERSION=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)
    API_ID=$(terraform -chdir="$INFRA_DIR" output -raw api_container_id)
    INDEXER_ID=$(terraform -chdir="$INFRA_DIR" output -raw indexer_container_id)
    echo "Deploying version $APP_VERSION"
    scw container container update "${API_ID##*/}" registry-image="$REG/bim-api:$APP_VERSION" region=fr-par
    scw container container deploy "${API_ID##*/}" region=fr-par
    scw container container update "${INDEXER_ID##*/}" registry-image="$REG/bim-indexer:$APP_VERSION" region=fr-par
    scw container container deploy "${INDEXER_ID##*/}" region=fr-par
    ;;
  ship)
    "$0" build
    "$0" push
    "$0" redeploy
    ;;
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
    echo "Usage: $0 {build|push|redeploy|ship|plan|apply|init}"
    exit 1
    ;;
esac
