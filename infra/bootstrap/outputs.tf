output "bucket_name" {
  description = "Tfstate bucket name (use as `bucket` in the backend block)"
  value       = scaleway_object_bucket.tfstate.name
}

output "bucket_region" {
  description = "Tfstate bucket region"
  value       = "fr-par"
}

output "bucket_endpoint" {
  description = "S3-compatible endpoint for the backend block"
  value       = "https://s3.fr-par.scw.cloud"
}

output "rw_access_key" {
  description = "Access key for the local operator (terraform apply)"
  value       = scaleway_iam_api_key.tfstate_rw.access_key
  sensitive   = true
}

output "rw_secret_key" {
  description = "Secret key for the local operator (terraform apply)"
  value       = scaleway_iam_api_key.tfstate_rw.secret_key
  sensitive   = true
}

