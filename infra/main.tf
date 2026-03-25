# =============================================================================
# BIM — Scaleway Infrastructure (Pre-prod)
# =============================================================================
# Manages: Container Registry, Managed PostgreSQL Database, Serverless Containers.
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

# ---------- Managed PostgreSQL Database ----------
resource "scaleway_rdb_instance" "bim" {
  name           = "bim-prod"
  node_type      = "DB-DEV-S"
  engine         = "PostgreSQL-16"
  is_ha_cluster  = false
  disable_backup = false # Snapshots auto
  user_name      = "bim"
  password       = var.db_password
  volume_type    = "lssd" # 20 GB included with DB-DEV-S
  region         = var.region
}

resource "scaleway_rdb_database" "bim" {
  instance_id = scaleway_rdb_instance.bim.id
  name        = "bim"
}

resource "scaleway_rdb_privilege" "bim" {
  instance_id   = scaleway_rdb_instance.bim.id
  user_name     = scaleway_rdb_instance.bim.user_name
  database_name = scaleway_rdb_database.bim.name
  permission    = "all"
}

locals {
  database_url = "postgres://${scaleway_rdb_instance.bim.user_name}:${urlencode(var.db_password)}@${scaleway_rdb_instance.bim.load_balancer[0].ip}:${scaleway_rdb_instance.bim.load_balancer[0].port}/${scaleway_rdb_database.bim.name}?uselibpqcompat=true&sslmode=require"
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
    DATABASE_URL         = local.database_url
    AVNU_API_KEY         = var.avnu_api_key
    CLAIMER_PRIVATE_KEY  = var.claimer_private_key
    CLAIMER_ADDRESS      = var.claimer_address
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
    PRESET    = var.network
    LOG_LEVEL = var.indexer_log_level
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
