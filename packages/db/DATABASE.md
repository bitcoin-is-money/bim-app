# Database

## Why a shared `@bim/db` package?

The API and the Indexer are two separate applications that share the same
PostgreSQL database:

- The **API** writes accounts, sessions, challenges, settings.
- The **Indexer** writes on-chain transactions (WBTC transfers).
- The **API** reads transactions written by the Indexer to display them to users.

Without a shared package, the schema would be duplicated or one app would
depend on the other — creating a circular dependency. `@bim/db` is the single
source of truth for schema, connection logic, and migration tooling.

```
apps/api ──────┐
               ├──▶ @bim/db (schema + connection + migrations)
apps/indexer ──┘
```

## Drizzle ORM

[Drizzle](https://orm.drizzle.team/) is a TypeScript ORM for SQL databases.
It provides two things:

- **drizzle-orm** — query builder and runtime (used in app code)
- **drizzle-kit** — CLI for schema management: push, generate migrations, run migrations, studio

The schema is defined in TypeScript (not SQL), and Drizzle handles the
translation to PostgreSQL DDL.

## Package structure

```
packages/db/
├── src/
│   ├── schema.ts             # All table definitions (single source of truth)
│   ├── connection.ts         # DatabaseConnection class (pool, SSL, retry, startup validation)
│   └── index.ts              # Re-exports schema
├── drizzle.config.ts         # Drizzle Kit config
├── drizzle/                  # Generated migration files (if using generate + migrate)
├── DATABASE.md               # This file
└── package.json              # db:push, db:generate, db:migrate, db:studio scripts
```

Sub-path exports:
- `@bim/db` — schema only (tables, types)
- `@bim/db/connection` — `DatabaseConnection` class (pool, SSL, retry, startup validation)

## Tables

| Table | Description |
|-------|-------------|
| `bim_accounts` | WebAuthn accounts (credentials, Starknet address, deployment status) |
| `bim_sessions` | Login sessions (linked to account, with expiry) |
| `bim_challenges` | WebAuthn challenges (single-use, with TTL) |
| `bim_user_settings` | User preferences (fiat currency, language) |
| `bim_transactions` | Indexed on-chain transactions (WBTC transfers) |
| `bim_transaction_descriptions` | User-facing descriptions for transactions |

## Commands

All commands run from the **`packages/db`** workspace (or from root via convenience scripts):

```bash
# Push schema directly to database (no migration files)
DATABASE_URL="..." npm run db:push -w @bim/db

# Generate a migration file from schema changes
DATABASE_URL="..." npm run db:generate -w @bim/db

# Run pending migration files
DATABASE_URL="..." npm run db:migrate -w @bim/db

# Open Drizzle Studio (visual database browser)
DATABASE_URL="..." npm run db:studio -w @bim/db

# On production, use Terraform to set the `DATABASE_URL` environment variable.
DATABASE_URL=$(terraform output -raw database_url) ...
```

## SSL Configuration

The `DATABASE_SSL` env var controls SSL for `node-postgres` (`pg`). The `pg` driver
does **not** parse `?sslmode=` from connection strings — it requires explicit config.

| `DATABASE_SSL` | `pg` option | PostgreSQL standard |
|----------------|-------------|---------------------|
| `disable` | no `ssl` | `sslmode=disable` |
| `require` | `ssl: { rejectUnauthorized: false }` | `sslmode=require` |
| `verify-full` | `ssl: { rejectUnauthorized: true }` | `sslmode=verify-full` |

Scaleway Serverless SQL endpoints include `?sslmode=require` in the URL, but this is
silently ignored by `pg`. You must set `DATABASE_SSL=verify-full` explicitly.

## Push vs Generate + Migrate

Two strategies to apply schema changes to a database:

### `drizzle-kit push` (direct)

Compares your TypeScript schema with the actual database, computes the diff,
and applies it immediately. No files generated, no history kept.

```
schema.ts ──compare──▶ live database ──apply diff──▶ done
```

**Pros:** simple, fast, one command.
**Cons:** no review step, no migration history, no rollback.
**Use for:** development, prototyping, pre-prod.

### `drizzle-kit generate` + `drizzle-kit migrate` (versioned)

1. `generate` — compares schema with the last known state and produces a
   numbered SQL migration file in `packages/db/drizzle/`.
2. `migrate` — runs all pending migration files in order.

```
schema.ts ──diff──▶ 0001_add_column.sql ──review──▶ apply to database
```

**Pros:** reviewable SQL, version history (committed to git), rollback possible.
**Cons:** two-step process, migration files to manage.
**Use for:** production with real user data.

### Which one to use?

| Environment | Strategy | Why |
|-------------|----------|-----|
| Local dev | `push` | Fast iteration, data is disposable |
| Pre-prod | `push` | Good enough, data is disposable |
| Production | `generate` + `migrate` | Review SQL before applying, keep history |

When moving to production, switch by running `generate` once to create a
baseline migration, then use `generate` + `migrate` for all subsequent changes.
