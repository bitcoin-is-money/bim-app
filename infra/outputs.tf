# =============================================================================
# Outputs
# =============================================================================

output "registry_endpoint" {
  description = "Docker registry endpoint (for docker login & push)"
  value       = scaleway_registry_namespace.bim.endpoint
}

output "database_endpoint" {
  description = "PostgreSQL endpoint (host:port)"
  value       = "${scaleway_rdb_instance.bim.load_balancer[0].ip}:${scaleway_rdb_instance.bim.load_balancer[0].port}"
}

output "database_url" {
  description = "Full DATABASE_URL (for migrations)"
  value       = local.database_url
  sensitive   = true
}

output "api_url" {
  description = "Public URL of the application"
  value       = "https://${scaleway_container.api.domain_name}"
}

output "api_domain" {
  description = "API domain — copy this value to terraform.tfvars as api_domain"
  value       = scaleway_container.api.domain_name
}

output "api_container_id" {
  description = "API container ID (for logs and CI/CD)"
  value       = scaleway_container.api.id
}

output "indexer_container_id" {
  description = "Indexer container ID (for logs and CI/CD)"
  value       = scaleway_container.indexer.id
}

# ---------- CI IAM credentials (for GitHub Actions) ----------

output "ci_access_key" {
  description = "Access key for the GitHub Actions CI workflow"
  value       = scaleway_iam_api_key.ci.access_key
  sensitive   = true
}

output "ci_secret_key" {
  description = "Secret key for the GitHub Actions CI workflow"
  value       = scaleway_iam_api_key.ci.secret_key
  sensitive   = true
}
