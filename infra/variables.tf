# =============================================================================
# Variable definitions
# =============================================================================
variable "project_id" {
  description = "Scaleway BIM project ID"
  type        = string
}

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

variable "db_user" {
  description = "PostgreSQL admin user name for the managed database"
  type        = string
  default     = "bim"
}

variable "db_password" {
  description = "PostgreSQL admin password for the managed database"
  type        = string
  sensitive   = true
}

# ---------- API secrets ----------

variable "avnu_api_key" {
  description = "AVNU paymaster API key — optional, empty disables sponsored mode (https://portal.avnu.fi)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "api_log_level" {
  description = "Log level for the API container (trace, debug, info, warn, error, fatal)"
  type        = string
  default     = "info"
}

variable "webauthn_authenticator_attachment" {
  description = "WebAuthn authenticator attachment mode ('platform' for built-in biometrics, 'cross-platform' for roaming keys like USB)"
  type        = string
  default     = "cross-platform"

  validation {
    condition     = contains(["platform", "cross-platform"], var.webauthn_authenticator_attachment)
    error_message = "webauthn_authenticator_attachment must be 'platform' or 'cross-platform'"
  }
}

# ---------- Indexer ----------

variable "indexer_log_level" {
  description = "Log level for the indexer container (trace, debug, info, warn, error, fatal)"
  type        = string
  default     = "info"
}

variable "dna_token" {
  description = "Apibara DNA token for the indexer (https://www.apibara.com)"
  type        = string
  sensitive   = true
}

# ---------- Claimer (backend Starknet account for auto-claiming forward swaps) ----------

variable "claimer_private_key" {
  description = "STARK private key of the backend claimer account"
  type        = string
  sensitive   = true
}

variable "claimer_address" {
  description = "Starknet address of the backend claimer account"
  type        = string
}

# ---------- BIM addresses ----------

variable "bim_treasury_address" {
  description = "Starknet address of the BIM fee treasury"
  type        = string
}

variable "bim_treasury_private_key" {
  description = "STARK private key of the BIM treasury account"
  type        = string
  sensitive   = true
}

variable "avnu_sponsor_activity_url" {
  description = "Full AVNU sponsor-activity endpoint URL used to fetch remaining sponsor credits — required (e.g. https://sepolia.api.avnu.fi/paymaster/v1/sponsor-activity on testnet, https://starknet.api.avnu.fi/paymaster/v1/sponsor-activity on mainnet)"
  type        = string
}

# ---------- Cron ----------

variable "cron_secret" {
  description = "Shared secret for Scaleway cron → API authentication"
  type        = string
  sensitive   = true
  default     = ""
}

# ---------- Alerting (Slack notifications via Scaleway cron → API) ----------

variable "enable_alerting" {
  description = "Enable balance alerting via Scaleway cron (requires cron_secret and slack vars)"
  type        = bool
  default     = false
}

variable "alerting_slack_bot_token" {
  description = "Slack bot token for balance alerts — required when alerting is enabled (xoxb-...)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "alerting_balance_cron" {
  description = "Cron schedule for balance checks (default: daily at 8 AM UTC)"
  type        = string
  default     = "0 8 * * *"
}

variable "alerting_avnu_threshold_strk" {
  description = "AVNU balance alert threshold in STRK (default: 15)"
  type        = number
  default     = 15
}

variable "alerting_treasury_threshold_strk" {
  description = "Treasury balance alert threshold in STRK (default: 200)"
  type        = number
  default     = 200
}

# ---------- Reporting (weekly BIM activity snapshot via Scaleway cron → API) ----------

variable "enable_reporting" {
  description = "Enable weekly reporting via Scaleway cron (requires cron_secret and alerting_slack_bot_token)"
  type        = bool
  default     = false
}

variable "activity_reporting_cron" {
  description = "Cron schedule for the weekly activity report (default: Monday 8 AM UTC)"
  type        = string
  default     = "0 8 * * 1"
}
