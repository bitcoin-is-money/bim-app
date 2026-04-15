# =============================================================================
# BIM — Terraform backend bootstrap
# =============================================================================
# One-shot sub-project that provisions the Scaleway Object Storage bucket used
# as remote backend for the main infra (../main.tf), plus a local-operator
# IAM application scoped to that bucket:
#   - bim-tfstate-rw: used by the local operator running `terraform apply`
#
# CI read access to the tfstate is granted via the `bim-ci` IAM app in the
# main infra (see ../main.tf), which bundles tfstate read + deploy perms.
#
# State for THIS sub-project stays local (tiny, rarely touched).
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
  region = "fr-par"
  zone   = "fr-par-1"
}

# ---------- Tfstate bucket ----------

resource "scaleway_object_bucket" "tfstate" {
  name   = "bim-tfstate"
  region = "fr-par"

  versioning {
    enabled = true
  }
}

# ---------- Read-write IAM app (local operator) ----------

resource "scaleway_iam_application" "tfstate_rw" {
  name        = "bim-tfstate-rw"
  description = "Terraform backend — read/write (local operator)"
}

resource "scaleway_iam_policy" "tfstate_rw" {
  name           = "bim-tfstate-rw"
  application_id = scaleway_iam_application.tfstate_rw.id

  rule {
    project_ids          = [var.project_id]
    permission_set_names = ["ObjectStorageFullAccess"]
  }
}

resource "scaleway_iam_api_key" "tfstate_rw" {
  application_id = scaleway_iam_application.tfstate_rw.id
  description    = "Terraform backend — read/write key"
  expires_at     = var.api_key_expires_at
}

