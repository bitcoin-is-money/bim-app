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
  wbtc_token_address = {
    mainnet = "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac"
    testnet = "0x00452bd5c0512a61df7c7be8cfea5e4f893cb40e126bdc40aee6054db955129e"
  }
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
    BIM_TREASURY_ADDRESS = var.bim_treasury_address
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

  environment_variables = merge(
    {
      PRESET           = var.network
      STARKNET_NETWORK = var.network
      LOG_LEVEL        = var.indexer_log_level
    },
    var.enable_alerting ? {
      ENABLE_ALERTING = "true"
    } : {}
  )

  secret_environment_variables = merge(
    {
      APIBARA_RUNTIME_CONFIG = jsonencode({
        connectionString = local.database_url
      })
      DNA_TOKEN            = var.dna_token
      STARKNET_RPC_URL     = "https://api.cartridge.gg/x/starknet/${var.network}"
      STRK_TOKEN_ADDRESS   = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
      WBTC_TOKEN_ADDRESS   = local.wbtc_token_address[var.network]
      BIM_TREASURY_ADDRESS     = var.bim_treasury_address
      BIM_TREASURY_PRIVATE_KEY = var.bim_treasury_private_key
    },
    var.enable_alerting ? {
      ALERTING_SLACK_BOT_TOKEN          = var.alerting_slack_bot_token
      ALERTING_SLACK_CHANNEL            = var.alerting_slack_channel
      ALERTING_BALANCE_CRON             = var.alerting_balance_cron
      ALERTING_AVNU_THRESHOLD_STRK      = tostring(var.alerting_avnu_threshold_strk)
      ALERTING_TREASURY_THRESHOLD_STRK  = tostring(var.alerting_treasury_threshold_strk)
      BIM_AVNU_ADDRESS                  = var.bim_avnu_address
    } : {}
  )

  timeouts {
    create = "3m"
    update = "3m"
  }
}
