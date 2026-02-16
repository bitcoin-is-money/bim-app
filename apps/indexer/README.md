# @bim/indexer

Apibara-based Starknet indexer that watches ERC20 Transfer events and stores matching transactions in the shared `@bim/db` database.

## Prerequisites

- PostgreSQL running (see `docker-compose.yml` at repo root)
- Schema pushed: `DATABASE_URL=postgresql://bim_user:bim_password@localhost:5432/bim npm run db:push -w @bim/api`
- A DNA token from [app.apibara.com](https://app.apibara.com)

## Secret files

Secrets are loaded via `dotenv-cli` from `.secret` files (gitignored by `*.local`).

**`.env.testnet.secret`** (for dev):
```
DNA_TOKEN=dna_your_testnet_key
```

**`.env.mainnet.secret`** (for prod):
```
DNA_TOKEN=dna_your_mainnet_key
DATABASE_URL=postgresql://user:password@host:5432/bim
```

## Commands

```bash
# Dev (Sepolia testnet, hot-reload)
npm run dev -w @bim/indexer

# Production (mainnet)
npm run start -w @bim/indexer

# Tests
npm run test -w @bim/indexer
```

## Configuration

Network-specific config (stream URL, contract addresses) is managed via **presets** in `apibara.config.ts`, not env files. Only secrets go in `.secret` files.

| Preset | Stream | WBTC contract |
|--------|--------|---------------|
| `testnet` | `sepolia.starknet.a5a.ch` | `0x00ab...fc09` (Sepolia) |
| `mainnet` | `mainnet.starknet.a5a.ch` | `0x03fe...e7ac` (Mainnet) |

Optional env overrides: `STARTING_BLOCK`, `ACCOUNT_CACHE_TTL_MS` (default: 60s).

## Architecture

```
indexers/
  wbtc-transfers.indexer.ts   # Apibara entry point (thin shell)
src/
  process-transfers.ts        # Pure logic
  starknet.ts                 # Utilities
  account-cache.ts            # Cached account
  types.ts                    # Shared types
```
