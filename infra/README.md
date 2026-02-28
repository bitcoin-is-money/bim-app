# BIM Infrastructure — Scaleway

Terraform configuration to deploy BIM on Scaleway Serverless.

> New to Terraform? See [TERRAFORM.md](TERRAFORM.md) for core concepts, key files, and state management.

## Resources Created

| Resource | Type | Description |
|----------|------|-------------|
| Container Registry | `scaleway_registry_namespace` | Private Docker registry for API + Indexer images |
| Managed PostgreSQL | `scaleway_rdb_instance` + `scaleway_rdb_database` | PostgreSQL 16 (DB-DEV-S, 20 GB LSSD) |
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

1. **`npm run infra:apply -- -target=scaleway_registry_namespace.bim`** — creates only the Docker registry (minimum to push images)
2. **`npm run docker:build` + `npm run docker:push`** — build and push images to the registry
3. **`npm run infra:apply`** — creates everything else (database, containers) and deploys

For subsequent deploys, use `npm run docker:ship` (build + push + redeploy in one command).

Once CI/CD is set up (`.github/workflows/deploy.yml`), steps 2 and 3 happen
automatically on every push to `main`.

## Initial Setup (Step by Step)

### 1. Initialize Terraform

```bash
npm run infra:init
```

Downloads the Scaleway provider plugin into `.terraform/` and creates
`.terraform.lock.hcl` (commit this file — it pins the provider version).

### 2. Configure variables

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` — fill in your secrets (`avnu_api_key`, `dna_token`).
Leave `api_domain` commented out for now (set it after the first deploy, step 6).

### 3. Create the registry (first apply — minimal)

```bash
npm run infra:apply -- -target=scaleway_registry_namespace.bim
```

Only creates the Docker registry. This is the minimum needed before pushing images.

### 4. Build and push Docker images

```bash
# Login to the Scaleway registry (username is always "nologin", password is your SCW secret key)
REGISTRY=$(cd infra && terraform output -raw registry_endpoint)
docker login $REGISTRY -u nologin

# Build and push images (tagged with git hash + latest)
npm run docker:build
npm run docker:push
```

### 5. Create remaining infrastructure and deploy

```bash
npm run infra:apply
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
npm run infra:apply
```

Your app is now live at the `api_url` output.

### 7. Run database migrations

```bash
DATABASE_URL=$(cd infra && terraform output -raw database_url) npm run db:push
```

## Common Commands

All Terraform commands can be run via `npm run infra:*` from the project root,
or directly with `terraform` from the `infra/` directory.

### Preview changes (dry run)

```bash
npm run infra:plan
```

Compares your `.tf` files against the state file and shows what would be
created/modified/destroyed. Nothing is actually changed. Safe to run anytime.

### Apply changes

```bash
npm run infra:apply
```

Runs a `plan`, shows the diff, asks for confirmation, then executes.
Idempotent: running it twice with no changes does nothing.

### Docker image workflow

```bash
npm run docker:build      # Build images tagged with git hash + latest
npm run docker:push       # Push to Scaleway registry
npm run docker:redeploy   # Update Scaleway containers to new version
npm run docker:ship       # All three in one command
```

### Override a variable on the fly

```bash
npm run infra:apply -- -var="network=testnet"
```

Overrides the value from `terraform.tfvars` for this run only.

### View outputs

```bash
cd infra
terraform output                  # All outputs (secrets are hidden)
terraform output api_url          # Single output
terraform output -raw api_domain  # Raw value (no quotes — useful in scripts)
```

### View container logs

```bash
# Snapshot (last logs via Scaleway CLI — not real-time)
cd infra
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
cd infra && terraform refresh
```

Re-reads the actual state of all resources from Scaleway and updates the local
state file. Useful if someone changed something via the console.

### Destroy everything

```bash
cd infra && terraform destroy
```

Shows what will be deleted, asks for confirmation, then deletes all managed resources.

> **Warning**: This deletes the database and all data. There is no undo.

### Import existing resources

If you already created resources via the console or `scaleway-setup.sh`,
you can bring them under Terraform management without recreating them:

```bash
cd infra
terraform import scaleway_registry_namespace.bim fr-par/<registry-id>
terraform import scaleway_rdb_instance.bim fr-par/<instance-id>
terraform import scaleway_rdb_database.bim fr-par/<instance-id>/<database-name>
terraform import scaleway_container_namespace.bim fr-par/<namespace-id>
terraform import scaleway_container.api fr-par/<api-container-id>
terraform import scaleway_container.indexer fr-par/<indexer-container-id>
```

After import, run `terraform plan` to check if the config matches the real state.

## File Structure

```
infra/
├── .terraform/              # Downloaded plugins (gitignored, like node_modules/)
├── .terraform.lock.hcl      # Provider version lock (committed, like package-lock.json)
├── main.tf                  # Provider config + all resources
├── outputs.tf               # Values displayed after apply (URLs, IDs)
├── variables.tf             # Variable declarations with defaults and validation
├── terraform.tfstate        # State file with resource IDs + secrets (gitignored, local only)
├── terraform.tfvars.example # Template (committed — copy to terraform.tfvars)
├── terraform.tfvars         # Your actual values and secrets (gitignored)
└── README.md

scripts/
└── docker.sh                # Docker build/push/deploy + Terraform pass-through
```

All operations are accessible via `npm run docker:*` and `npm run infra:*` from the project root.

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
