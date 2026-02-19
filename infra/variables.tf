# =============================================================================
# Variable definitions
# =============================================================================

variable "region" {
  description = "Scaleway region"
  type        = string
  default     = "fr-par"
}

variable "network" {
  description = "Starknet network (testnet or mainnet)"
  type        = string
  default     = "mainnet"

  validation {
    condition     = contains(["testnet", "mainnet"], var.network)
    error_message = "network must be 'testnet' or 'mainnet'"
  }
}

variable "api_domain" {
  description = "API container domain — copy from outputs after first apply"
  type        = string
  default     = ""
}

# ---------- Database ----------

variable "db_password" {
  description = "PostgreSQL admin password for the managed database"
  type        = string
  sensitive   = true
}

# ---------- Secrets ----------

variable "avnu_api_key" {
  description = "AVNU paymaster API key (https://portal.avnu.fi)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "api_log_level" {
  description = "Log level for the API container (trace, debug, info, warn, error, fatal)"
  type        = string
  default     = "info"
}

variable "indexer_log_level" {
  description = "Log level for the indexer container (trace, debug, info, warn, error, fatal)"
  type        = string
  default     = "info"
}

variable "dna_token" {
  description = "Apibara DNA token for the indexer (https://www.apibara.com)"
  type        = string
  sensitive   = true
  default     = ""
}
