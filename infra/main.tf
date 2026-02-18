# =============================================================================
# BIM — Scaleway Infrastructure (Pre-prod)
# =============================================================================
# Manages: Container Registry, Serverless SQL Database, Serverless Containers.
#
# Workflow:
#   cd infra
#   terraform init
#   terraform apply -target=scaleway_registry_namespace.bim   # Registry only
#   <build & push Docker images>
#   terraform apply                 # Everything else (DB, containers)
#   # Set api_domain in terraform.tfvars
#   terraform apply                 # Updates WebAuthn config
# =============================================================================

terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.0"
    }
  }
  required_version = ">= 1.0"
}

provider "scaleway" {
  region = var.region
  zone   = "${var.region}-1"
}

# ---------- Container Registry ----------

resource "scaleway_registry_namespace" "bim" {
  name      = "bim-prod"
  is_public = false
  region    = var.region
}

# ---------- Serverless SQL Database (PostgreSQL) ----------
# https://www.scaleway.com/en/docs/serverless-sql-databases/quickstart/
resource "scaleway_sdb_sql_database" "bim" {
  name    = "bim-prod"
  min_cpu = 0
  max_cpu = 4
  region  = var.region
}

# ---------- Database URL (IAM authentication) ----------
# Scaleway SDB endpoint has no credentials. IAM auth uses User/Application ID + Secret Key.
# Format: postgres://<user_id>:<secret_key>@<host>:5432/<db>?sslmode=require
locals {
  database_url = replace(
    scaleway_sdb_sql_database.bim.endpoint,
    "postgres://",
    "postgres://${var.scw_user_id}:${urlencode(var.scw_secret_key)}@"
  )
}

# ---------- Serverless Containers ----------

resource "scaleway_container_namespace" "bim" {
  name   = "bim-prod"
  region = var.region
}

resource "scaleway_container" "api" {
  namespace_id   = scaleway_container_namespace.bim.id
  name           = "bim-api"
  registry_image = "${scaleway_registry_namespace.bim.endpoint}/bim-api:latest"
  port           = 8080
  min_scale      = 1
  max_scale      = 2
  memory_limit   = 512
  cpu_limit      = 500
  privacy        = "public"
  http_option    = "redirected"
  deploy         = true
  region         = var.region

  # Env vars that override defaults baked into the Docker image (.env.testnet/.env.mainnet).
  # Only values that differ from local dev are set here.
  environment_variables = merge(
    {
      NETWORK                           = var.network
      DATABASE_SSL                      = "verify-full"
      WEBAUTHN_AUTHENTICATOR_ATTACHMENT = "cross-platform"
      LOG_LEVEL                         = var.api_log_level
    },
    # WebAuthn domain is only set once we know the container's domain (after first apply).
    # Until then, the image defaults (localhost) apply — WebAuthn won't work until next apply.
    var.api_domain != "" ? {
      WEBAUTHN_RP_ID  = var.api_domain
      WEBAUTHN_ORIGIN = "https://${var.api_domain}"
    } : {}
  )

  secret_environment_variables = {
    DATABASE_URL = local.database_url
    AVNU_API_KEY = var.avnu_api_key
  }

  timeouts {
    create = "3m"
    update = "3m"
  }
}

resource "scaleway_container" "indexer" {
  namespace_id   = scaleway_container_namespace.bim.id
  name           = "bim-indexer"
  registry_image = "${scaleway_registry_namespace.bim.endpoint}/bim-indexer:latest"
  port           = 8080
  min_scale      = 1
  max_scale      = 1
  memory_limit   = 512
  cpu_limit      = 500
  privacy        = "private"
  deploy         = true
  region         = var.region

  environment_variables = {
    PRESET       = var.network
    DATABASE_SSL = "verify-full"
    LOG_LEVEL    = var.indexer_log_level
  }

  secret_environment_variables = {
    APIBARA_RUNTIME_CONFIG = jsonencode({
      connectionString = local.database_url
    })
    DNA_TOKEN = var.dna_token
  }

  timeouts {
    create = "3m"
    update = "3m"
  }
}
