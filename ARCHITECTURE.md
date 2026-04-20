# Architecture

This document describes how BIM is organized at a technical level. For a
product-level overview, see the [README](README.md). For contribution
workflow, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Table of Contents

- [Goals & Principles](#goals--principles)
- [High-Level View](#high-level-view)
- [Monorepo Layout](#monorepo-layout)
- [Dependency Graph](#dependency-graph)
- [Domain Layer (Hexagonal)](#domain-layer-hexagonal)
- [Backend Application (apps/api)](#backend-application-appsapi)
- [Frontend (apps/front)](#frontend-appsfront)
- [Indexer (apps/indexer)](#indexer-appsindexer)
- [CLI (apps/cli)](#cli-appscli)
- [External Gateways](#external-gateways)
- [WebAuthn Flow](#webauthn-flow)
- [Payment Flows](#payment-flows)
- [Database](#database)
- [Testing Pyramid](#testing-pyramid)
- [Configuration & Secrets](#configuration--secrets)
- [Deployment](#deployment)

## Goals & Principles

BIM is built around a few non-negotiable principles:

1. **Framework-free domain logic.** Everything the wallet *knows* — accounts,
   payments, swaps, fees, WebAuthn rules — lives in a pure TypeScript
   package with no HTTP, no database, and no SDK imports. You can run it
   in a browser, a worker, or a test without any setup.

2. **Hexagonal / ports & adapters.** The domain defines *ports*
   (interfaces); the backend provides *adapters* (implementations) that
   plug real infrastructure into those ports. Swapping PostgreSQL for
   something else, or the Atomiq SDK for a different swap provider, is a
   matter of writing a new adapter.

3. **Backend orchestration, thin frontend.** Complex flows (swaps, RPC
   calls, auto-deployment) live server-side. The frontend displays data,
   collects input, and performs WebAuthn ceremonies. This keeps wallet
   behavior consistent and auditable.

4. **Typed all the way down.** Branded types for domain identifiers,
   Zod-validated HTTP boundaries, exhaustive `switch` on discriminated
   unions. Compile errors are cheaper than production bugs.

## High-Level View

Three columns: **BIM processes** (left), the **partners / gateways** we
integrate with (middle, vertical), and the **underlying networks**
they ultimately reach (right).

```
       BIM                          PARTNERS / GATEWAYS                         NETWORKS
──────────────────            ──────────────────────────────            ─────────────────────────

┌─────────────────┐
│ User's browser  │
│  (Angular +     │
│   WebAuthn)     │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐            ┌──────────────────────────┐               ┌──────────────────┐
│                 │──────────▶│   Atomiq SDK             │──┬──────────▶│ Lightning Network│
│                 │            │   (swap LPs:             │  │            └──────────────────┘
│                 │            │    LN / BTC / Starknet)  │  │            ┌──────────────────┐
│                 │            └──────────────────────────┘  └──────────▶│   Bitcoin (L1)   │
│                 │                                                       └──────────────────┘
│                 │            ┌──────────────────────────┐               ┌──────────────────┐
│                 │            │   AVNU Paymaster         │               │                  │
│   apps/api      │──────────▶│   (SNIP-29 gasless       │──────────┐    │                  │
│    (Hono)       │            │    deploy + tx)          │          │    │                  │
│                 │            └──────────────────────────┘          │    │                  │
│  routes         │                                                  │    │                  │
│    │            │            ┌──────────────────────────┐          │    │                  │
│    ▼            │            │   Starknet RPC           │          ├──▶│                  │
│  use-cases      │──────────▶│   (node provider: e.g.   │──────────┤    │                  │
│    │            │            │    Infura, Alchemy, …)   │          │    │                  │
│    ▼            │            └──────────────────────────┘          │    │                  │
│  ports          │                                                  │    │                  │
│    ▲            │            ┌──────────────────────────┐          │    │                  │
│    │            │──────────▶│   Slack Web API          │          │    │  Starknet (L2)   │
│  adapters       │            │   (operational alerts)   │          │    │   on Ethereum    │
│  (gateways +    │            └──────────────────────────┘          │    │                  │
│   persistence)  │                                                  │    │                  │
│                 │            ┌──────────────────────────┐          │    │                  │
│                 │──────────▶│   PostgreSQL             │          │    │                  │
│                 │            │   (Drizzle ORM, owned)   │          │    │                  │
└─────────────────┘            └───────────▲──────────────┘          │    │                  │
                                            │                        │    │                  │
                                            │ shared DB              │    │                  │
                                            │                        │    │                  │
┌─────────────────┐                         │                        │    │                  │
│  apps/indexer   │                         │                        │    │                  │
│   (Apibara      │──── writes tx rows ─────┘                        │    │                  │
│    runtime)     │                                                  │    │                  │
│                 │            ┌──────────────────────────┐          │    │                  │
│                 │──────────▶│   Apibara DNA            │──────────┘    │                  │
│                 │            │   (Starknet event stream)│               │                  │
└─────────────────┘            └──────────────────────────┘               └──────────────────┘
```

What to take away from this diagram:

- **Users** talk only to `apps/api` over HTTPS. The Angular frontend is
  bundled and served by the API — single process, single origin.
- **`apps/api`** is the only BIM process that calls external partners
  on behalf of users. Every outbound call leaves through a typed
  gateway adapter (the boxes labelled "adapters" in the `apps/api`
  block) so the domain layer stays pure.
- **Partners vs. networks** — the middle column lists the **services
  we integrate with** (Atomiq SDK, AVNU Paymaster, a Starknet RPC
  node provider, Slack, our own PostgreSQL, Apibara DNA); the right
  column is the **networks they put us in touch with** (Lightning
  Network, Bitcoin L1, Starknet L2 on Ethereum). This distinction
  matters because we can swap a partner (change RPC provider, swap
  Atomiq for another LP aggregator) without changing the networks,
  and vice-versa.
- **AVNU Paymaster** sponsors Starknet transactions under SNIP-29,
  enabling gasless account deployment the first time a user pays.
  See the "Auto-deployment" flow for details.
- **Atomiq SDK** is the swap orchestrator that routes funds between
  Lightning, Bitcoin, and Starknet via a network of liquidity
  providers. Every non-native payment path goes through it.
- **`apps/indexer`** is a separate process (different container in
  prod) that streams Starknet events through Apibara DNA, filters
  WBTC transfers to addresses we watch, and writes them into the
  **same PostgreSQL instance** that `apps/api` reads from. That's
  how transaction history is surfaced without hammering the RPC.
- **Slack** is fire-and-forget: operational alerts only, no user
  data flows there.

## Monorepo Layout

```
bim/
├── packages/                       # Libraries (no runtime of their own)
│   ├── lib/                        # @bim/lib      — shared generic utilities
│   ├── domain/                     # @bim/domain   — domain + use cases
│   ├── db/                         # @bim/db       — Drizzle schema/client
│   ├── test-toolkit/               # @bim/test-toolkit
│   ├── atomiq/                     # @bim/atomiq (SDK adapter)
│   ├── atomiq-storage-postgres/    # @bim/atomiq-storage-postgres
│   ├── slack/                      # @bim/slack
│   └── starknet/                   # @bim/starknet
├── apps/                           # Runnable applications
│   ├── api/                        # Hono backend + static frontend
│   ├── front/                      # Angular 21 PWA
│   ├── indexer/                    # Apibara indexer
│   └── cli/                        # Operational CLI
├── infra/                          # Terraform (Scaleway)
├── doc/flow/                       # Flow diagrams
│   ├── receive-lightning.md
│   ├── receive-bitcoin.md
│   └── swap-monitor.md
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

Every `packages/*` entry is importable as an npm workspace
(`@bim/domain`, `@bim/lib`, …). Everything is ESM (`"type": "module"`).

## Dependency Graph

Packages are organized in layers. Every arrow reads "depends on".

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 0 — leaves (no @bim/* dependencies)                          │
│                                                                     │
│   @bim/lib                                                          │
│   @bim/db                                                           │
│   @bim/test-toolkit                                                 │
│   @bim/atomiq-storage-postgres                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 1 — domain                                                   │
│                                                                     │
│   @bim/domain    ──▶  @bim/lib                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 2 — adapters / gateways                                      │
│                                                                     │
│   @bim/starknet  ──▶  @bim/domain, @bim/lib                        │
│   @bim/slack     ──▶  @bim/domain                                  │
│   @bim/atomiq    ──▶  @bim/domain, @bim/atomiq-storage-postgres    │
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 3 — applications                                             │
│                                                                     │
│   @bim/api      ──▶  @bim/atomiq, @bim/atomiq-storage-postgres,    │
│                       @bim/db, @bim/domain, @bim/lib, @bim/slack,   │
│                       @bim/starknet                                 │
│                                                                     │
│   @bim/indexer  ──▶  @bim/db, @bim/domain, @bim/lib                │
│                                                                     │
│   @bim/cli      ──▶  @bim/domain, @bim/lib, @bim/starknet,         │
│                       @bim/test-toolkit                             │
│                                                                     │
│   @bim/front    ──▶  @bim/lib                                      │
└─────────────────────────────────────────────────────────────────────┘
```

Rules:

- **Leaves have no `@bim/*` dependencies.** `@bim/lib`, `@bim/db`,
  `@bim/test-toolkit`, and `@bim/atomiq-storage-postgres` are all self-
  contained: they either wrap a single external dependency (Drizzle,
  noble, the Atomiq SDK's storage interface) or provide pure utilities.
- **`@bim/domain` depends only on `@bim/lib`**, and has **no** framework
  or SDK imports — the single exception is `pino`, imported as
  `type Logger` only (no runtime dependency), so services can accept
  a logger through DI without a port wrapper. This is enforced socially
  — if you're tempted to add `hono`, `drizzle`, or an external SDK here,
  write an adapter in `apps/api/src/adapters/` or in a dedicated
  `packages/*` adapter instead.
- **Adapter packages (`@bim/starknet`, `@bim/slack`, `@bim/atomiq`)**
  sit between the domain and an external SDK. They import from the
  domain (to speak its language) and from an external library (to do
  the actual I/O). `@bim/atomiq-storage-postgres` is an exception: it
  only targets the Atomiq SDK's storage interface and has no need for
  the domain, which is why it's a leaf.
- **`@bim/api` is the aggregator.** It wires every adapter and the raw
  `hono` HTTP layer into a running process.
- **`@bim/indexer`** is deliberately lean: it only needs `@bim/db`
  (to write transactions), `@bim/domain` (for shared types), and
  `@bim/lib` (for logging and utilities) — no Starknet or Atomiq
  adapters, because Apibara handles the RPC side.
- **`@bim/cli`** reuses the Starknet adapter and the test toolkit to
  run E2E flows against real environments.
- **`@bim/front`** only uses `@bim/lib` for shared browser-safe
  utilities; the rest of its communication with the backend goes
  through HTTP.

## Domain Layer (Hexagonal)

Inside `packages/domain/src/` each bounded context has its own folder:

```
packages/domain/src/
├── account/         # Account entity, status, Starknet address derivation
├── auth/            # WebAuthn challenge, session, credential
├── currency/        # Money, Amount, Asset value objects
├── health/          # Health-check domain
├── notifications/   # Slack/domain notification contracts
├── payment/         # Receive/Pay use cases, fee calculator, ERC20 calls
├── ports/           # Interfaces consumed by use cases, implemented by adapters
├── shared/          # Branded types (AccountId, ChallengeId, …), errors, result
├── swap/            # Swap entity, state machine, swap monitor
└── user/            # UserSettings, Transaction, WatchedAddress
```

Each context typically contains:

- **Entities & value objects** — dumb, immutable, self-validating.
- **Domain services** — pure functions operating on the entities.
- **Use cases** (a.k.a. application services) — orchestrate entities and
  ports to fulfill a single user-visible action (e.g. `RegisterAccount`,
  `PayLightningInvoice`, `ClaimSwap`).
- **Ports** — TypeScript interfaces describing what the use case needs
  (`AccountRepository`, `SwapGateway`, `PaymasterGateway`,
  `StarknetRpcGateway`, `Clock`, `Logger`…).

Ports live under `packages/domain/src/ports/` and are implemented by
adapters in `apps/api/src/adapters/`.

## Backend Application (apps/api)

```
apps/api/src/
├── main.ts               # Process entry: load env, build context, start Hono
├── app.ts                # Route mounting + middleware
├── app-config.ts         # Typed config from env
├── app-context.ts        # Dependency injection container
├── app-startup-health.ts # Startup checks for external services
├── load-env.ts           # dotenv loader (.env.testnet[.secret] etc.)
├── types.ts
├── errors/               # HTTP error mapping
├── middleware/           # Rate limit, session, CORS, logging
├── monitoring/           # Metrics, Sentry-like helpers
├── routes/               # Hono routes — one folder per bounded context
│   ├── ...
│   └── account/
└── adapters/
    ├── gateways/         # Ports → external services
    │                     #   (atomiq, avnu, starknet rpc, slack, …)
    └── persistence/      # Ports → PostgreSQL (via @bim/db)
```

**Request lifecycle.** A typical `POST /api/payment/pay/execute` flows
through:

1. Hono route handler (validation with Zod)
2. Use case from `@bim/domain/payment` — pure, receives ports from the
   app context
3. Adapters implementing those ports — Atomiq gateway, AVNU paymaster,
   Starknet RPC, account repository
4. JSON response shaped by a route-level DTO mapper

The app context (`app-context.ts`) is a hand-written, typed DI container.
No framework magic; each adapter is constructed once at startup and
handed to the routes that need it.

## Frontend (apps/front)

Angular 21 PWA. Key characteristics:

- **Standalone components, signals, zoneless** (modern Angular idioms).
- **Guards**: `auth` (requires a session) and `guest` (requires no
  session).
- **Pages**: `auth`, `create-account`, `home`, `account-setup`,
  `receive`, `pay`, `confirm`, `success`, `menu`, `about`.
- **Shared components**: amount/currency inputs, buttons, spinner,
  notifications, `rail-badge` (network chip used on tx rows and the
  pay-confirm hero), `slide-to-confirm` (payment commit gesture).
- **WebAuthn**: the frontend performs the browser-side WebAuthn ceremony
  (`navigator.credentials.create` / `.get`) and submits the credential
  blob + challenge ID to the backend for verification.
- The built bundle is copied into `apps/api/public/app/` and served by
  the API in production (single process, single port).

### Design tokens

`apps/front/src/styles-colors.scss` is the single source of truth for
visual tokens:

- **Rails** (`--rail-btc`, `--rail-ln`, `--rail-sn`) — color per payment
  network. Consumed by `rail-badge`, the Receive tab indicators, and the
  pay-confirm hero pill.
- **Semantic states** (`--state-success`, `--state-warn`,
  `--state-danger`).
- **Surfaces** (`--surface-0`…`--surface-3`) and **text roles**
  (`--text-hi`, `--text-med`, `--text-lo`) — reach for these instead of
  `neutral-800`/`neutral-900` directly.
- **Motion** (`--motion-enter`, `--motion-exit`, `--motion-press`) —
  shared easings for entrance, exit, and press feedback.

Two typography utility classes in `styles.scss` pair with the tokens:
`.tabular` (tabular-nums for amounts) and `.mono` (JetBrains Mono for
Bitcoin data — addresses, invoices, tx hashes). UI chrome stays Inter.

## Indexer (apps/indexer)

An [Apibara](https://www.apibara.com/) indexer. Streams Starknet DNA
events, filters `Transfer` events for the WBTC contract, cross-references
the destination address against the registered user addresses table, and
writes matching transfers into the `transactions` table. The API then
serves this data via `GET /api/user/transactions`.

Running configuration:

- **Stream**: Starknet Sepolia on testnet, mainnet on prod
  (configured via `streamUrl` in `apps/indexer/apibara.config.ts`)
- **Storage**: same PostgreSQL instance as the API, with a separate
  Drizzle plugin for checkpoints
- **Auth**: Apibara DNA token supplied via `.env.{network}.secret` (git
  ignored)

## CLI (apps/cli)

`@bim/cli` groups operational commands:

- **Health checks** against a running API instance
- **End-to-end flows** (deploy account, transfer Starknet / Lightning /
  Bitcoin) used for smoke tests and test-net verification
- **AVNU credit monitoring** with Slack notifications (drives the cron
  job that warns when paymaster credits are low)

It's a thin CLI over the same gateway abstractions used by the backend.

## External Gateways

| Gateway | Purpose | Adapter location |
|---------|---------|------------------|
| **Atomiq SDK** | Lightning / Bitcoin / Starknet swaps | `apps/api/src/adapters/gateways/atomiq/` + `packages/atomiq/` |
| **AVNU Paymaster** (SNIP-29) | Gasless Starknet account deployment | `apps/api/src/adapters/gateways/avnu/` |
| **Starknet RPC** | Balance, nonce, contract calls, transaction submission | `apps/api/src/adapters/gateways/starknet/` + `packages/starknet/` |
| **Apibara DNA** | Streaming Starknet events to the indexer | `apps/indexer/` |
| **Slack** | Operational alerts | `packages/slack/` |
| **Bolt11** | Lightning invoice decoder | `light-bolt11-decoder` (npm) |
| **SimpleWebAuthn** | WebAuthn server-side verification | `@simplewebauthn/server` (npm) |

Each external dependency is wrapped behind a domain port, so tests can
swap it for a fake without touching the real network.

## WebAuthn Flow

The wallet uses WebAuthn (passkeys) both for **authentication** and for
**transaction signing**.

### Registration

```
client                              server
  │                                    │
  │  POST /api/auth/register/begin     │
  │──────────────────────────────────▶│
  │                                    │ creates challenge, returns
  │                                    │ challengeId + publicKeyOptions
  │◀──────────────────────────────────│
  │                                    │
  │ navigator.credentials.create(…)    │
  │                                    │
  │  POST /api/auth/register/complete  │
  │   {challengeId, credential}        │
  │──────────────────────────────────▶│
  │                                    │ verifies (SimpleWebAuthn),
  │                                    │ stores credential, derives
  │                                    │ Starknet address, sets
  │                                    │ status=pending
  │◀──────────────────────────────────│
```

Challenges are explicit (`challengeId` is returned in the body, not in a
cookie) so the same flow works across browsers, native apps, and CLIs.
Challenges expire in 60 seconds and are single-use. Sign counters are
tracked to detect credential cloning.

### Authentication

Same shape with `/api/auth/login/{begin,complete}`. A successful
authentication sets a session cookie (HttpOnly, SameSite=Strict, Secure,
7-day TTL).

## Payment Flows

See the flow diagrams under [`doc/flow/`](doc/flow/) for the step-by-step
sequences:

- [`doc/flow/receive-lightning.md`](doc/flow/receive-lightning.md)
- [`doc/flow/receive-bitcoin.md`](doc/flow/receive-bitcoin.md)
- [`doc/flow/swap-monitor.md`](doc/flow/swap-monitor.md)

Summary of the key flows:

### Receive Lightning

1. User calls `POST /api/payment/receive` with `{network: "lightning", amount}`.
2. Backend creates a swap with Atomiq (Starknet → Lightning).
3. Backend persists the swap and returns a Lightning invoice (QR data).
4. Frontend polls the swap status endpoint.
5. The swap monitor (background task) watches Atomiq for completion and
   auto-claims when ready.

### Pay Lightning

1. `POST /api/payment/pay/parse` — decode the invoice, quote the swap,
   return details.
2. `POST /api/payment/pay/execute` with the WebAuthn credential.
3. If the account is still `pending`, it is auto-deployed via the AVNU
   paymaster before the payment is executed.
4. Backend creates the swap, signs the Starknet tx, submits it.
5. Frontend polls the swap/payment status.

### Auto-deployment

The first time a user makes a payment, BIM deploys their Starknet account
contract on the fly, sponsored by the AVNU paymaster (no upfront gas
needed). Status transitions: `pending` → `deploying` → `deployed` (or
`failed`).

## Database

PostgreSQL, managed via [Drizzle ORM](https://orm.drizzle.team/). The
schema lives in [`packages/db/src/schema.ts`](packages/db/src/schema.ts);
see `npm run db:generate` / `npm run db:push` / `npm run db:migrate`.

Key tables (non-exhaustive):

- `accounts` — one row per user (credential, sign counter, Starknet
  address, deployment status)
- `challenges` — WebAuthn challenges with TTL and single-use flag
- `sessions` — authenticated sessions
- `swaps` — swap records (Lightning / Bitcoin / Starknet) with state
- `transactions` — transaction history surfaced to the user
- `watched_addresses` — addresses the indexer watches
- `user_settings` — per-user preferences

## Testing Pyramid

| Layer | Location | What it covers | Runtime |
|-------|----------|----------------|---------|
| **Unit** | `packages/*/test/`, `apps/*/test/unit/` | Pure domain logic, small adapters with fakes | Vitest, no Docker |
| **Integration** | `apps/api/test/integration/` | Real PostgreSQL (Testcontainers) + real domain wiring + fake external gateways | Vitest + Docker |
| **Testnet** | `apps/api/test/testnet/` | Real AVNU + real Starknet Sepolia + real Atomiq; used to validate behavior against live sandboxes | Vitest + env vars |
| **E2E** | `apps/api/test/e2e-api-prod/` + `@bim/cli` | Deploy account, transfer STRK / LN / BTC end-to-end against a deployed API | Vitest + deployed target |
| **Frontend** | `apps/front/src/**/*.test.ts` | Component / service tests | Vitest + jsdom |

Commands:

```bash
npm test                         # All unit tests
npm run test:integration          # Integration tests (Docker required)
npm run test:testnet -w @bim/api  # Testnet tests (requires AVNU_API_KEY)
npm run test:e2e -w @bim/api      # E2E tests against a deployed target
```

> Note: API tests import from each `packages/*` library's compiled
> `dist/`, not from source. After editing **any** lib (domain, lib, db,
> starknet, atomiq, slack…), rebuild them all with `npm run build:libs`
> before re-running the API tests — otherwise you'll be testing against
> stale output.

## Configuration & Secrets

BIM uses a layered config approach:

1. **Network defaults** — checked in as
   `apps/api/.env.testnet` and `apps/api/.env.mainnet`
   (public blockchain constants: RPC URLs, token addresses, etc.)
2. **Secrets** — `.env.testnet.secret` / `.env.mainnet.secret` files, git
   ignored. The API requires them to exist (they can be empty). API keys
   such as `AVNU_API_KEY`, `ALERTING_SLACK_BOT_TOKEN`, and
   `CLAIMER_PRIVATE_KEY` go here.
3. **Runtime env vars** — anything exported in the shell or injected by
   Docker / Scaleway overrides the files.

See [`apps/api/.env.local.example`](apps/api/.env.local.example) for the
full list of variables and their purpose.

## Deployment

Production runs on [Scaleway Serverless Containers](https://www.scaleway.com/en/serverless-containers/):

- **Build & deploy**: `npm run docker:ship` builds both API and indexer
  images, pushes them to the Scaleway registry, runs database migrations,
  and redeploys the containers. A GitHub Actions workflow
  ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) does
  the same on pushes to `main`.
- **Infrastructure**: managed by Terraform under [`infra/`](infra/).
- **Database**: Scaleway Managed PostgreSQL.
- **Secrets**: GitHub Actions secrets and Terraform variables (never
  committed).

---

Questions or suggestions on this doc? Open an issue or a PR — feedback on
the architecture itself is as welcome as feedback on the code.
