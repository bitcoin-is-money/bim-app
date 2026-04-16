# BIM Infrastructure — Scaleway

Terraform configuration to deploy BIM on Scaleway Serverless.

> New to Terraform? See [TERRAFORM.md](TERRAFORM.md) for core concepts, key files, and state management.

## Resources Created

| Resource | Type | Description |
|----------|------|-------------|
| Container Registry | `scaleway_registry_namespace` | Private Docker registry for API + Indexer images |
| Managed PostgreSQL | `scaleway_rdb_instance` + `scaleway_rdb_database` + `scaleway_rdb_privilege` | PostgreSQL 16 (DB-DEV-S, 20 GB LSSD), DB user privileges |
| Container Namespace | `scaleway_container_namespace` | Logical group hosting both serverless containers |
| bim-api | `scaleway_container` | **Public** — frontend + API (HTTPS via Scaleway reverse proxy) |
| bim-indexer | `scaleway_container` | **Private** — Apibara blockchain indexer |
| Balance check cron | `scaleway_container_cron.balance_check` | Conditional (`enable_alerting`) — periodic balance alerting on bim-api |
| Activity reporting cron | `scaleway_container_cron.activity_reporting` | Conditional (`enable_reporting`) — weekly activity report on bim-api |

### Architecture

```
   Internet (HTTPS :443)       Scaleway Cron Scheduler
            │                            │
            ▼                            │ POST {secret, type}
   ┌────────────────────────┐            │
   │ Scaleway reverse proxy │            │
   └──────────┬─────────────┘            │
              │ :8080 (internal)         │
              ▼                          │
   ┌────────────────────────────┐        │     ┌────────────────────┐
   │  bim-api (public)          │ ◄──────┘     │ bim-indexer        │
   │  Hono + Angular            │              │ Apibara indexer    │
   │                            │              │ (private)          │
   └─────────┬──────────────────┘              └─────────┬──────────┘
             │                                           │
             └─────────────────────┬─────────────────────┘
                                   │ (no VPC routing yet — all traffic goes through public internet with TLS)
                                   ▼
                        ┌──────────────────┐
                        │ Managed          │
                        │ PostgreSQL 16    │
                        └──────────────────┘
```

The cron resources are Scaleway-managed schedulers that POST to bim-api with
a shared `CRON_SECRET` and a `type` discriminator. They are created only when
`enable_alerting` / `enable_reporting` are `true` in `terraform.tfvars`.

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
└──────────────┘         └─┬─┬─┬─┬──┘   └────────┬────────┘
                           │ │ │ │               │
┌──────────────┐           │ │ │ │               │
│ AVNU         │◄──────────┘ │ │ │               │
│ Paymaster    │  JSON-RPC   │ │ │               │
└──────────────┘             │ │ │               │
┌──────────────┐             │ │ │               │
│ AVNU sponsor │◄────────────┘ │ │               │
│ activity     │  HTTPS        │ │               │
└──────────────┘               │ │               │
┌──────────────┐               │ │               │
│ Slack API    │◄──────────────┘ │               │
│ (alerting)   │  HTTPS          │               │
└──────────────┘                 │               │
                          ┌──────────────────┐   │
                          │ Apibara DNA      │◄──┘
                          │ (block stream)   │  authenticated stream
                          └──────────────────┘

API calls out to:
  - Starknet RPC          — read state, submit transactions (Cartridge, Alchemy...)
  - AVNU Paymaster        — gasless account deployment & sponsored transactions
  - AVNU sponsor activity — credit/usage monitoring (used by balance-check cron)
  - Atomiq LP Node        — cross-chain swaps (Lightning / Bitcoin ↔ Starknet)
  - Slack API             — alerting webhook (only when `enable_alerting = true`)

Indexer calls out to:
  - Apibara DNA      — real-time Starknet block stream (WBTC transfer events)
  - Starknet RPC     — additional on-chain reads via Cartridge gateway

By default, Scaleway containers have full internet access.
```

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.0
- [Scaleway CLI](https://github.com/scaleway/scaleway-cli) configured (`scw init`)
- [Docker](https://docs.docker.com/get-docker/) (for building and pushing images)
- Scaleway API key (Access Key + Secret Key) for the **Scaleway provider**
- An `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` pair for the **S3 remote backend** —
  see [Remote Backend & Credentials](#remote-backend--credentials) (provisioned once
  by `infra/bootstrap/`)

The Terraform **Scaleway provider** authenticates via `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`
environment variables, or `~/.config/scw/config.yaml` (created by `scw init`).

The Terraform **S3 backend** (holding `terraform.tfstate`) uses a separate credential
pair — see the next section.

## Remote Backend & Credentials

Terraform uses **two independent credential sets** that must both be configured locally:

| Credential | Purpose | Source |
|-----|-----|-----|
| `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` | Scaleway provider — manages all cloud resources | Your personal Scaleway API key |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 backend — stores `terraform.tfstate` | `bim-tfstate-rw` IAM application (see bootstrap below) |

The state is kept in a private Scaleway Object Storage bucket (`bim-tfstate`, S3-compatible).
Two IAM applications sit in front of it:

- **`bim-tfstate-rw`** — you, the local operator. Full access to the tfstate bucket.
  Used to run `terraform apply` on `infra/` from your machine.
- **`bim-ci`** — GitHub Actions. Read-only on the tfstate plus push / redeploy
  permissions. Defined in `main.tf`. Never used locally.

This split follows least-privilege: a CI-key leak cannot rewrite Terraform state or
destroy the bucket.

### First-time bootstrap

The tfstate bucket and the `bim-tfstate-rw` IAM application are provisioned by a
one-shot sub-project at `infra/bootstrap/`. Its own state stays local — it is tiny
and rarely changes, and only the primary operator runs it.

```sh
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # fill in project_id
terraform init
terraform apply
```

Capture the RW key pair from the outputs and store it in your password manager:

```sh
terraform output -raw rw_access_key
terraform output -raw rw_secret_key
```

You run the bootstrap **once per environment**. After that, you never use the
personal Scaleway account for state — only for the Scaleway provider via
`SCW_ACCESS_KEY` / `SCW_SECRET_KEY`.

> **Why a separate sub-project** — chicken-and-egg: the backend bucket must exist
> before the main infra can configure `backend "s3"`. Keeping the bucket in a
> separate root avoids entangling its lifecycle with the app infra.

### Configuring credentials locally

Once you have the RW key pair, export it before any `terraform -chdir=infra *` or
`npm run docker:*` command. Two compatible options:

**Option A — `.envrc` file at the repo root (gitignored)**

```sh
# S3 backend — bim-tfstate-rw
export AWS_ACCESS_KEY_ID="SCW..."
export AWS_SECRET_ACCESS_KEY="..."

# Scaleway provider — your personal key
export SCW_ACCESS_KEY="SCW..."
export SCW_SECRET_KEY="..."
```

Load it in each shell with `source .envrc`, or install [direnv](https://direnv.net/)
to load / unload automatically on `cd`. `.envrc` is already in `.gitignore`.

**Option B — `~/.aws/credentials` named profile**

```ini
[bim-tfstate]
aws_access_key_id = SCW...
aws_secret_access_key = ...
```

Then export `AWS_PROFILE=bim-tfstate` in the shell where you run Terraform.

Both options coexist. The AWS SDK credential chain checks env vars first, then
falls back to the named profile.

### Common pitfalls

- **`export` is required.** `AWS_ACCESS_KEY_ID=...` without `export` is visible to
  `echo` in the current shell but **not inherited** by the `terraform` subprocess.
- **Beware a `[default]` profile pointing to a real AWS account** in
  `~/.aws/credentials`. If env vars are missing or not exported, the SDK silently
  picks `[default]` and you get a 403 from Scaleway (rejected signature).
- **No stale `AWS_SESSION_TOKEN`.** Scaleway has no concept of session tokens —
  a leftover one from a previous `aws sso login` makes every request fail.
- **One shell, one source.** `source .envrc` only affects the current shell;
  each new terminal needs its own load (or direnv).

Sanity check, in the same shell where you run Terraform:

```sh
env | grep -E '^AWS_'                           # expect exactly the two vars
aws s3 ls s3://bim-tfstate/ \
  --endpoint-url=https://s3.fr-par.scw.cloud \
  --region=fr-par                               # should list state objects
```

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

Creates the database, container namespace, both containers, and any enabled
crons (`balance_check` if `enable_alerting = true`, `activity_reporting` if
`enable_reporting = true`) in one pass. Note the outputs, especially
`api_domain` and `api_url`.

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

Migrations are versioned SQL files generated from the Drizzle schema. The full
workflow (`db:generate` then `db:migrate`), conventions, and troubleshooting
live in [`packages/db/DATABASE.md`](../packages/db/DATABASE.md).

To apply pending migrations against the freshly created Scaleway database:

```bash
DATABASE_URL=$(cd infra && terraform output -raw database_url) npm run db:migrate
```

**Do not use `db:push` against the prod database** — `drizzle-kit push` syncs
the schema directly without migration files and can drop columns/tables
without warning. It is intended for local dev only.

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

| GitHub Secret | Terraform Output | Notes |
|---------------|------------------|-------|
| `SCW_REGISTRY_ENDPOINT` | `registry_endpoint` | |
| `SCW_API_CONTAINER_ID` | `api_container_id` | |
| `SCW_INDEXER_CONTAINER_ID` | `indexer_container_id` | |
| `DATABASE_URL` | `database_url` | Full URL with credentials (sensitive). `database_endpoint` is host:port only and not enough for migrations. |

Quick export:

```bash
echo "SCW_REGISTRY_ENDPOINT=$(terraform output -raw registry_endpoint)"
echo "SCW_API_CONTAINER_ID=$(terraform output -raw api_container_id)"
echo "SCW_INDEXER_CONTAINER_ID=$(terraform output -raw indexer_container_id)"
echo "DATABASE_URL=$(terraform output -raw database_url)"
```

## Secrets Required

| Secret (`terraform.tfvars`) | Where to get it / how to generate |
|-----------------------------|-----------------------------------|
| Scaleway API Key (`SCW_ACCESS_KEY`/`SCW_SECRET_KEY` env) | Scaleway Console > Profile > API Keys |
| S3 backend key (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env) | `bim-tfstate-rw` — see [Remote Backend & Credentials](#remote-backend--credentials) |
| `db_password` | Generate (e.g. `openssl rand -base64 32`) — used by Terraform to create the DB user |
| `avnu_api_key` | https://portal.avnu.fi (remember to add credits) |
| `dna_token` | https://www.apibara.com |
| `claimer_address` / `claimer_private_key` | Starknet account used by the API to claim on-chain payments |
| `bim_treasury_address` / `bim_treasury_private_key` | Starknet treasury account (used by API and indexer) |
| `cron_secret` | Generate (e.g. `openssl rand -hex 32`) — shared between Scaleway crons and the API handler |
| `alerting_slack_bot_token` | Slack app > OAuth & Permissions (only if `enable_alerting = true`) |
