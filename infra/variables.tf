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

# ---------- Scaleway IAM (for database authentication) ----------

variable "scw_user_id" {
  description = "IAM User ID or Application ID — used as database username. Get it with: scw iam api-key get $(scw config get access-key) -o json | jq -r '.user_id'"
  type        = string
}

variable "scw_secret_key" {
  description = "IAM Secret Key — used as database password"
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

variable "dna_token" {
  description = "Apibara DNA token for the indexer (https://www.apibara.com)"
  type        = string
  sensitive   = true
  default     = ""
}
