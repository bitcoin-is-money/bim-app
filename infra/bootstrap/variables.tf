variable "project_id" {
  description = "Scaleway BIM project ID"
  type        = string
}

variable "api_key_expires_at" {
  description = "Expiration date for the IAM API keys (RFC3339). Scaleway caps this at 1 year — rotate before this date."
  type        = string
  default     = "2027-04-14T00:00:00Z"
}
