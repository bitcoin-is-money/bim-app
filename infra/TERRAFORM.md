# Terraform Refresher

## Core Concepts

```hcl
# PROVIDER — Plugin that talks to a cloud API (Scaleway, AWS, GCP...).
# Installed by `terraform init`. Configured once per project.
provider "scaleway" {
  region = "fr-par"
}

# RESOURCE — An infrastructure object to create/manage.
#   resource "<type>" "<local_name>" { ... }
#
#   - type:       Determined by the provider (e.g. scaleway_container)
#   - local_name: YOUR label, used only inside Terraform to reference this resource.
#                 Not sent to the cloud. You pick whatever name makes sense.

# VARIABLE — Input parameter (set via terraform.tfvars or -var flag).
variable "network" {
  type    = string
  default = "testnet"
}

# OUTPUT — Value displayed after `terraform apply` and queryable with `terraform output`.
output "api_url" {
  value = "https://${scaleway_container.api.domain_name}"
}
```

## Key Files

| File | Role | Commit? |
|------|------|---------|
| `*.tf` | Infrastructure definition | Yes |
| `terraform.tfvars` | Your variable values (secrets!) | **No** (gitignored) |
| `.terraform.lock.hcl` | Provider version lock (like `package-lock.json`) | **Yes** |
| `terraform.tfstate` | Current state of deployed resources (contains secrets!) | **No** (gitignored) |
| `.terraform/` | Downloaded provider plugins (like `node_modules/`) | **No** (gitignored) |

## About `terraform.tfstate`

Terraform tracks what it has created in a **state file** (`terraform.tfstate`).
This file maps your `.tf` config to real cloud resource IDs. It is essential for
Terraform to know what exists and what needs to change on `apply`.

**It contains sensitive values** (database URLs, API keys) in plain text.
It is gitignored and stays local. For team use, consider a
[remote backend](https://developer.hashicorp.com/terraform/language/backend)
(S3, Scaleway Object Storage...) with encryption.

If the state file is lost, Terraform loses track of existing resources.
You can recover with `terraform import` (see README.md).
