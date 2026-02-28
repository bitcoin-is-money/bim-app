# BIM

Bitcoin wallet on Starknet using WebAuthn (passkey/biometric) for key management.

## Prerequisites

- Node.js >= 22
- Docker & Docker Compose
- npm (specified in `packageManager` field)

## NPM Scripts

### Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API with tsx watch (testnet, port 8080) |
| `npm run dev:front` | Start Angular dev server (port 4200) |

### Build

| Command | Description |
|---------|-------------|
| `npm run build` | Build everything (api + indexer + frontend) |
| `npm run build:libs` | Build shared libraries (lib, domain, db, test-toolkit) |
| `npm run build:api` | Build API bundle (libs + api + frontend) |
| `npm run build:front` | Build Angular frontend |
| `npm run build:indexer` | Build Apibara indexer |

### Test

| Command | Description |
|---------|-------------|
| `npm test` | Run all unit tests (all workspaces) |
| `npm run test:integration` | Run API integration tests (requires Docker) |

### Database

| Command | Description |
|---------|-------------|
| `npm run db:up` | Start PostgreSQL container + push schema |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser) |

### Docker

| Command | Description |
|---------|-------------|
| `npm run docker:up` | Build images + start full stack (postgres + api + indexer) |
| `npm run docker:down` | Stop all containers |
| `npm run docker:logs` | Follow container logs |
| `npm run docker:build` | Build Docker images tagged with git hash + latest |
| `npm run docker:push` | Push images to Scaleway registry |
| `npm run docker:redeploy` | Update and redeploy Scaleway containers |
| `npm run docker:ship` | Build + push + redeploy (full deploy pipeline) |

Use `NETWORK=mainnet` to target mainnet (default: `testnet`):

```bash
NETWORK=mainnet npm run docker:up
```

### Infrastructure (Terraform)

| Command | Description |
|---------|-------------|
| `npm run infra:init` | Initialize Terraform |
| `npm run infra:plan` | Preview infrastructure changes |
| `npm run infra:apply` | Apply infrastructure changes |

### Utility

| Command | Description |
|---------|-------------|
| `npm run clean` | Clean build outputs in all workspaces |
| `npm run clean:all` | Remove all node_modules and build outputs |

## Project Structure

```
.
├── packages/
│   ├── lib/          # @bim/lib     — Shared utilities (pure TS)
│   ├── domain/       # @bim/domain  — Domain & Application layer (pure TS)
│   ├── db/           # @bim/db      — Database schema, connection, migrations
│   └── test-toolkit/ # @bim/test-toolkit — Test helpers
├── apps/
│   ├── api/          # @bim/api     — Backend server (Hono + esbuild)
│   ├── front/        # @bim/front   — Angular 21 frontend
│   └── indexer/      # @bim/indexer  — Apibara blockchain indexer
├── infra/            # Terraform (Scaleway) — see [infra/README.md](infra/README.md)
└── scripts/          # docker.sh (Docker + deploy operations)
```

## Configuration

Each network has a committed `.env` file with defaults and a gitignored `.secret` file for secrets:

```
apps/api/.env.testnet         # Testnet defaults (committed)
apps/api/.env.testnet.secret  # Testnet secrets (gitignored, must exist)
apps/api/.env.mainnet         # Mainnet defaults (committed)
apps/api/.env.mainnet.secret  # Mainnet secrets (gitignored, must exist)
```

The `.secret` files must exist (can be empty). Secrets like `AVNU_API_KEY` go there.
