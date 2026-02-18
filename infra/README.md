# BIM Infrastructure — Scaleway

Terraform configuration to deploy BIM on Scaleway Serverless.

## Terraform Refresher

### Core Concepts

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

### Key Files

| File | Role | Commit? |
|------|------|---------|
| `*.tf` | Infrastructure definition | Yes |
| `terraform.tfvars` | Your variable values (secrets!) | **No** (gitignored) |
| `.terraform.lock.hcl` | Provider version lock (like `package-lock.json`) | **Yes** |
| `terraform.tfstate` | Current state of deployed resources (contains secrets!) | **No** (gitignored) |
| `.terraform/` | Downloaded provider plugins (like `node_modules/`) | **No** (gitignored) |

### About `terraform.tfstate`

Terraform tracks what it has created in a **state file** (`terraform.tfstate`).
This file maps your `.tf` config to real cloud resource IDs. It is essential for
Terraform to know what exists and what needs to change on `apply`.

**It contains sensitive values** (database URLs, API keys) in plain text.
It is gitignored and stays local. For team use, consider a
[remote backend](https://developer.hashicorp.com/terraform/language/backend)
(S3, Scaleway Object Storage...) with encryption.

If the state file is lost, Terraform loses track of existing resources.
You can recover with `terraform import` (see below).

## Resources Created

| Resource | Type | Description |
|----------|------|-------------|
| Container Registry | `scaleway_registry_namespace` | Private Docker registry for API + Indexer images |
| Serverless SQL Database | `scaleway_sdb_sql_database` | Managed PostgreSQL (auto-scales to zero) |
| bim-api | `scaleway_container` | **Public** — frontend + API (HTTPS via Scaleway reverse proxy) |
| bim-indexer | `scaleway_container` | **Private** — Apibara blockchain indexer |

### Architecture

```
Internet (HTTPS :443)
   │
   ▼
┌───────────────────────┐
│ Scaleway reverse proxy│  ← auto-generated URL, TLS termination
└──────────┬────────────┘
           │ :8080 (internal)
           ▼
┌────────────────────┐     ┌────────────────────┐
│  bim-api (public)  │     │ bim-indexer        │
│  Hono + Angular    │     │ Apibara indexer    │
└─────────┬──────────┘     └─────────┬──────────┘
          │                          │
          └────────────┬─────────────┘
                       │ (no VPC routing yet — all traffic goes through public internet with TLS)
                       ▼
            ┌──────────────────┐
            │ Serverless SQL   │
            │ PostgreSQL       │
            └──────────────────┘
```

The containers listen internally on port 8080. Scaleway places a reverse proxy
in front that handles HTTPS (port 443) and provides the public URL.

### External Services

```
                          ┌──────────────────────────┐
                          │   Starknet Blockchain    │
                          └──────────────────────────┘
                               ▲              ▲
                               │              │
                     JSON-RPC  │              │  gRPC stream
                               │              │
┌──────────────┐         ┌─────┴────┐   ┌─────┴───────────┐
│ Atomiq LP    │◄────────┤ bim-api  │   │ bim-indexer     │
│ (swap node)  │  REST   │          │   │                 │
└──────────────┘         └─────┬────┘   └────────┬────────┘
                               │                 │
┌──────────────┐               │                 │
│ AVNU         │◄──────────────┘                 │
│ Paymaster    │  JSON-RPC                       │
└──────────────┘                                 │
                          ┌──────────────────┐   │
                          │ Apibara DNA      │◄──┘
                          │ (block stream)   │  authenticated stream
                          └──────────────────┘

API calls out to:
  - Starknet RPC     — read state, submit transactions (Cartridge, Alchemy...)
  - AVNU Paymaster   — gasless account deployment & sponsored transactions
  - Atomiq LP Node   — cross-chain swaps (Lightning / Bitcoin ↔ Starknet)

Indexer calls out to:
  - Apibara DNA      — real-time Starknet block stream (WBTC transfer events)

By default, scaleway containers have full internet access.
```

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.0
- [Scaleway CLI](https://github.com/scaleway/scaleway-cli) configured (`scw init`)
- [Docker](https://docs.docker.com/get-docker/) (for building and pushing images)
- Scaleway API key (Access Key + Secret Key)

The Terraform provider authenticates via environment variables (`SCW_ACCESS_KEY`, `SCW_SECRET_KEY`)
or `~/.config/scw/config.yaml` (created by `scw init`).

## Deployment Workflow

Terraform manages infrastructure but does **not** build or push Docker images.
Scaleway requires images to exist in the registry before creating containers,
so the first deployment is a 3-step process:

1. **`terraform apply -target=scaleway_registry_namespace.bim`** — creates only the Docker registry (minimum to push images)
2. **`docker build` + `docker push`** — you build images locally and push them to the registry
3. **`terraform apply`** — creates everything else (database, containers) and deploys

Once CI/CD is set up (`.github/workflows/deploy.yml`), steps 2 and 3 happen
automatically on every push to `main`.

## Initial Setup (Step by Step)

### 1. Initialize Terraform

```bash
cd infra
terraform init
```

Downloads the Scaleway provider plugin into `.terraform/` and creates
`.terraform.lock.hcl` (commit this file — it pins the provider version).

### 2. Configure variables

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` — fill in your secrets (`avnu_api_key`, `dna_token`).
Leave `deploy = false` and `api_domain` commented out for now.

### 3. Create the registry (first apply — minimal)

```bash
terraform apply -target=scaleway_registry_namespace.bim
```

Only creates the Docker registry. This is the minimum needed before pushing images.

### 4. Build and push Docker images

```bash
# Login to the Scaleway registry (username is always "nologin", password is your SCW secret key)
REGISTRY=$(terraform output -raw registry_endpoint)
docker login $REGISTRY -u nologin

# Build from project root
cd ..
docker build -f apps/api/Dockerfile -t $REGISTRY/bim-api:latest .
docker build -f apps/indexer/Dockerfile -t $REGISTRY/bim-indexer:latest .

# Push images to the registry
docker push $REGISTRY/bim-api:latest
docker push $REGISTRY/bim-indexer:latest
```

### 5. Create remaining infrastructure and deploy

```bash
cd infra
terraform apply
```

Creates the database, container namespace, and both containers in one pass.
Note the outputs, especially `api_domain` and `api_url`.

### 6. Set the WebAuthn domain

Copy the `api_domain` output into your `terraform.tfvars`:

```hcl
api_domain = "bimxxxxxxxx-bim-api.functions.fnc.fr-par.scw.cloud"
```

Then apply again to inject the correct WebAuthn config:

```bash
terraform apply
```

Your app is now live at the `api_url` output.

### 7. Run database migrations

```bash
DB_URL=$(terraform output -raw database_endpoint)
cd ..
DATABASE_URL="$DB_URL" npm run db:push -w @bim/db
```

## Common Commands

### Preview changes (dry run)

```bash
terraform plan
```

Compares your `.tf` files against the state file and shows what would be
created/modified/destroyed. Nothing is actually changed. Safe to run anytime.

### Apply changes

```bash
terraform apply
```

Runs a `plan`, shows the diff, asks for confirmation, then executes.
Idempotent: running it twice with no changes does nothing.

### Auto-approve (skip confirmation)

```bash
terraform apply -auto-approve
```

Skips the interactive "yes/no" prompt. Useful in CI, risky in manual use.

### Override a variable on the fly

```bash
terraform apply -var="network=testnet"
```

Overrides the value from `terraform.tfvars` for this run only.

### View outputs

```bash
terraform output                  # All outputs (secrets are hidden)
terraform output api_url          # Single output
terraform output -raw api_domain  # Raw value (no quotes — useful in scripts)
```

### View full current state

```bash
terraform show
```

Displays every resource and its attributes as Terraform knows them.
Includes sensitive values.

### Force redeploy containers

Terraform only acts when the config changes. If containers are in error (e.g. after a
schema push or a config fix) and `terraform apply` says "0 changes", use `-replace`
to force recreation:

```bash
# Redeploy both containers
terraform apply -replace=scaleway_container.api -replace=scaleway_container.indexer

# Or just one
terraform apply -replace=scaleway_container.api
```

Also useful after pushing a new Docker image with the same `:latest` tag.

### View container logs

```bash
# Snapshot (last logs via Scaleway CLI — not real-time)
API_ID=$(terraform output -raw api_container_id)
scw container container logs $API_ID region=fr-par

INDEXER_ID=$(terraform output -raw indexer_container_id)
scw container container logs $INDEXER_ID region=fr-par
```

For **real-time streaming**, use `logcli` (Grafana Loki CLI).
Install: `go install github.com/grafana/loki/cmd/logcli@latest` or `brew install logcli`.

```bash
# Setup (one-time) — get values from Scaleway Cockpit > Tokens
export LOKI_ADDR=https://logs.cockpit.fr-par.scw.cloud
export LOKI_BEARER_TOKEN=<your-cockpit-token>

# Tail API logs in real-time
logcli query '{resource_name="bim-api"}' --tail

# Tail Indexer logs
logcli query '{resource_name="bim-indexer"}' --tail

# Filter: only errors
logcli query '{resource_name="bim-api"} |= "ERROR"' --tail
```

To create a Cockpit token: Console > Cockpit > Tokens > Generate token (with Logs read permission).

### Refresh state from cloud

```bash
terraform refresh
```

Re-reads the actual state of all resources from Scaleway and updates the local
state file. Useful if someone changed something via the console.

### Destroy everything

```bash
terraform destroy
```

Shows what will be deleted, asks for confirmation, then deletes all managed resources.

> **Warning**: This deletes the database and all data. There is no undo.

### Import existing resources

If you already created resources via the console or `scaleway-setup.sh`,
you can bring them under Terraform management without recreating them:

```bash
terraform import scaleway_registry_namespace.bim fr-par/<registry-id>
terraform import scaleway_sdb_sql_database.bim fr-par/<database-id>
terraform import scaleway_container_namespace.bim fr-par/<namespace-id>
terraform import scaleway_container.api fr-par/<api-container-id>
terraform import scaleway_container.indexer fr-par/<indexer-container-id>
```

After import, run `terraform plan` to check if the config matches the real state.

## File Structure

```
infra/
├── main.tf                  # Provider config + all 5 resources
├── variables.tf             # Variable declarations with defaults and validation
├── outputs.tf               # Values displayed after apply (URLs, IDs)
├── terraform.tfvars.example # Template (committed — copy to terraform.tfvars)
├── terraform.tfvars         # Your actual values and secrets (gitignored)
├── .terraform.lock.hcl      # Provider version lock (committed, like package-lock.json)
├── .terraform/              # Downloaded plugins (gitignored, like node_modules/)
├── terraform.tfstate        # State file with resource IDs + secrets (gitignored, local only)
├── .gitignore
└── README.md
```

## CI/CD Integration

The Terraform outputs map directly to the GitHub Actions secrets
used by `.github/workflows/deploy.yml`:

| GitHub Secret | Terraform Output |
|---------------|------------------|
| `SCW_REGISTRY_ENDPOINT` | `registry_endpoint` |
| `SCW_API_CONTAINER_ID` | `api_container_id` |
| `SCW_INDEXER_CONTAINER_ID` | `indexer_container_id` |
| `DATABASE_URL` | `database_endpoint` |

Quick export:

```bash
echo "SCW_REGISTRY_ENDPOINT=$(terraform output -raw registry_endpoint)"
echo "SCW_API_CONTAINER_ID=$(terraform output -raw api_container_id)"
echo "SCW_INDEXER_CONTAINER_ID=$(terraform output -raw indexer_container_id)"
echo "DATABASE_URL=$(terraform output -raw database_endpoint)"
```

## Secrets Required

| Secret | Where to get it |
|--------|-----------------|
| Scaleway API Key | Console Scaleway > Profile > API Keys |
| `avnu_api_key` | https://portal.avnu.fi |
| `dna_token` | https://www.apibara.com |
