# Language and communication rules

IMPORTANT:
- All generated code, comments, documentation, commit messages, and file contents MUST be written in English.
- Never generate content in French.
- This rule applies even if the user communicates in French.
- If content normally is generated in French, it must be translated to English before being written.

---

# Code modification policy

IMPORTANT:
- Never modify code directly without explicit user confirmation.
- Before making any code changes, you must:
  1. Explain what you're going to do
  2. Show the proposed changes or approach
  3. Wait for user confirmation
- This applies to all file modifications (creating, editing, or deleting files)
- Exception: You may proceed directly only if the user has given very explicit instructions about exactly what to change and how.

---

# Project Architecture

## Overview

Fullstack TypeScript monorepo with:
- **Backend**: Node.js + Hono (ESM)
- **Frontend**: Angular 21
- **Build**: esbuild
- **Test**: Vitest

The project uses npm workspaces for package management.

## Directory Structure

```
.
├── package.json            # Workspace root (coordination only)
├── tsconfig.base.json      # Shared TypeScript config
├── vitest.config.ts        # Vitest config
│
├── packages/               # Libraries (imported by other packages)
│   ├── lib/                # @bim/lib - Shared utilities (pure TS)
│   │   └── src/
│   │
│   └── domain/             # @bim/domain - Domain & Application layer (pure TS)
│       └── src/
│           ├── domain/     # Entities, Value Objects, Domain Services
│           ├── application/# Use Cases
│           └── ports/      # Interfaces for infrastructure
│
├── apps/                   # Applications (runnable entry points)
│   ├── api/                # @bim/api - Backend server (Hono)
│   │   ├── src/
│   │   │   ├── adapters/   # Port implementations
│   │   │   ├── routes/     # HTTP routes
│   │   │   └── main.ts     # Entry point
│   │   └── public/         # Front static files (built, gitignored)
│   │
│   └── front/              # Angular application
│       └── src/
│
└── CLAUDE.md               # This file
```

## Package Dependencies

```
apps/api → @bim/domain → @bim/lib
               ↑
          (pure TS, no framework dependencies)

apps/api serves apps/front (static files in production)
```

## Development

```bash
# Install all dependencies
npm install

# Run API in dev mode (with watch)
npm run dev

# Run front in dev mode
npm run dev:front

# Clean all packages
npm run clean
```

## Testing

### Test Commands

```bash
# Run ALL tests (unit + frontend)
npm test

# Run integration tests only (requires Docker for PostgreSQL & Starknet Devnet)
npm run test:integration

# Run tests for a specific workspace
npm run test -w @bim/lib          # Unit tests for lib
npm run test -w @bim/domain       # Unit tests for domain
npm run test -w @bim/api          # Unit tests for api
npm run test -w @bim/front        # Frontend tests

# Run all api tests (unit + integration)
npm run test:all -w @bim/api

# Watch mode (for development)
npm run test:watch -w @bim/api
```

### Test Structure

```
packages/lib/test/           # Unit tests for @bim/lib
packages/domain/test/        # Unit tests for @bim/domain
packages/test-toolkit/test/  # Unit tests for test utilities
apps/api/test/
├── unit/                    # Unit tests (mocked dependencies)
└── integration/             # Integration tests (real DB, real services)
    ├── api/                 # API endpoint tests
    └── flows/               # Flow tests
apps/front/src/              # Angular tests (*.test.ts alongside components)
```

### Test Rules

**IMPORTANT:** When modifying code, you MUST update the corresponding tests:

1. **New function/method** → Add unit tests for the new function
2. **Modified function signature** → Update existing tests to match new signature
3. **Modified behavior** → Update tests to verify new behavior
4. **New API endpoint** → Add integration test in `apps/api/test/integration/`
5. **Modified API flow** → Update integration tests in `apps/api/test/integration/flows/`

**Never** submit code changes without verifying tests pass:
```bash
npm test && npm run test:integration
```

## Build

```bash
# Build backend only (lib → domain → api)
npm run build

# Build everything (backend + front + copy to api/public)
npm run build:all

# The api server then serves both API and front on :8080
npm run start -w @bim/api
```

## Configuration

- **API port**: 8080 (default, configurable via PORT env var)
- **Front dev port**: 4200 (Angular CLI default)
- **Node.js version**: >= 22.0.0
- **Module system**: ESM (`"type": "module"`)

## Imports

Use scoped package names for cross-package imports:

```typescript
import { something } from '@bim/lib';
import { SomeUseCase } from '@bim/domain';
```

---

# Migration from Old Project (oldproject/)

## Old Project Overview

**Tech Stack:**
- **Frontend:** SvelteKit 5 + Vite
- **Backend:** SvelteKit server routes (Node.js adapter)
- **Database:** PostgreSQL with Drizzle ORM
- **Package Manager:** pnpm

**Mission:** Bitcoin wallet on Starknet using WebAuthn (passkey/biometric) for key management. Features: receive/send Bitcoin, Starknet assets, Lightning Network payments with gasless account deployment via AVNU paymaster.

---

## Old Project Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Home page (authenticated user experience, account deployment, Lightning swaps) |
| `/receive` | Receive payments (Lightning, Bitcoin, Starknet) |
| `/pay` | Send payments (Lightning, Bitcoin) |
| `/payment-demo` | Payment demonstration |
| `/qr-scanner` | QR code scanner |
| `/camera-test` | Camera testing utility |
| `/Settings` | User settings |
| `/ops` | Operations/admin page |
| `/homebis` | Alternate home variant |
| `/about-bim` | About BIM info |

---

## Old Project API Endpoints (69 total)

### Authentication & WebAuthn
- `POST /api/webauthn/register/begin` - Start registration ceremony
- `POST /api/webauthn/register/complete` - Complete registration
- `POST /api/webauthn/authenticate/begin` - Start authentication ceremony
- `POST /api/webauthn/authenticate/complete` - Complete authentication
- `POST /api/auth/logout` - User logout

### User Management
- `GET /api/user/me` - Get current user
- `GET /api/user/settings` - Get user settings
- `POST /api/user/settings` - Update user settings
- `GET /api/user/addresses` - Get registered addresses
- `POST /api/user/addresses/register` - Register Starknet address
- `GET /api/user/transactions` - Get transaction history

### Lightning Network
- `POST /api/lightning/create-invoice` - Create invoice for swap
- `POST /api/lightning/create-starknet-to-lightning` - Create Starknet→Lightning swap
- `GET /api/lightning/quote` - Get swap quote
- `GET /api/lightning/rates` - Get exchange rates
- `GET /api/lightning/limits` - Get swap limits
- `GET /api/lightning/supported-assets` - List supported assets
- `GET /api/lightning/health` - Health check
- `POST /api/lightning/claim-swap/[swapId]` - Claim completed swap
- `GET /api/lightning/swap-status/[swapId]` - Get swap status
- `GET /api/lightning/get-unsigned-txns/[swapId]` - Get unsigned transactions
- `GET /api/lightning/get-unsigned-claim-txns/[swapId]` - Get unsigned claim transactions
- `POST /api/lightning/submit-signed-txns/[swapId]` - Submit signed transactions
- `POST /api/lightning/start-payment-waiting/[swapId]` - Start payment waiting
- `GET /api/lightning/wait-commit-confirmation/[swapId]` - Poll commit confirmation
- `GET /api/lightning/wait-claim-confirmation/[swapId]` - Poll claim confirmation
- `POST /api/lightning/webhook` - Payment webhook
- `GET /api/lightning/verify-swap-state/[swapId]` - Verify swap state

### Bitcoin Network
- `POST /api/bitcoin/create-swap` - Create Bitcoin swap
- `POST /api/bitcoin/create-starknet-to-bitcoin` - Create Starknet→Bitcoin swap
- `GET /api/bitcoin/swap-status/[swapId]` - Get Bitcoin swap status
- `POST /api/bitcoin/recover-swap/[swapId]` - Recover failed swap

### AVNU (Account Deployment)
- `POST /api/avnu/build-paymaster-transaction` - Build paymaster transaction
- `POST /api/avnu/deploy-account` - Deploy WebAuthn account
- `POST /api/avnu/execute-paymaster-transaction` - Execute paymaster transaction
- `POST /api/avnu/execute-signed-paymaster-transaction` - Execute signed paymaster transaction

### RPC Proxy
- `GET /api/rpc` - General RPC proxy
- `POST /api/rpc-call` - Make RPC call
- `GET /api/rpc/balance` - Get account balance
- `GET /api/rpc/nonce` - Get account nonce
- `GET /api/rpc/nonce-for-address` - Get nonce for address
- `GET /api/rpc/estimate-fee` - Estimate transaction fee
- `GET /api/rpc/wait-transaction` - Wait for transaction
- `GET /api/rpc/fast-wait-transaction` - Fast polling transaction

### Pricing & Other
- `GET /api/pricing/price` - Get asset price
- `GET /api/atomiq/limits` - Get Atomiq swap limits
- `GET /api/health` - Full health check
- `GET /api/health-simple` - Simple health check
- `GET /api/metrics` - Application metrics

---

## New API Design

### Design Principles

1. **Backend orchestration**: Complex operations (swaps, RPC calls) handled server-side
2. **Simple frontend**: Client only displays data and collects user input
3. **Stateful operations**: Long-running operations return an ID for status polling
4. **WebAuthn signing**: Payment confirmation uses WebAuthn challenge/response
5. **Auto-deployment**: Account deployment is transparent, triggered on first payment

---

### API Endpoints (18 total vs 69 old)

#### Authentication (6 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register/begin` | Start WebAuthn registration |
| `POST` | `/api/auth/register/complete` | Complete registration |
| `POST` | `/api/auth/login/begin` | Start WebAuthn authentication |
| `POST` | `/api/auth/login/complete` | Complete authentication |
| `GET` | `/api/auth/session` | Get current session |
| `POST` | `/api/auth/logout` | Logout |

#### Account (2 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/account` | Get account info (status, starknetAddress, balances) |
| `POST` | `/api/account/deploy` | Trigger manual deployment (if not auto-deployed) |

#### Receive (2 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/receive` | Create receive request → returns QR data |
| `GET` | `/api/receive/:id` | Get receive request status (pending/completed/expired) |

**POST /api/receive request:**
```json
{
  "network": "lightning" | "bitcoin" | "starknet",
  "amount": 1000,           // Optional, in sats (Lightning/Bitcoin) or wei (Starknet)
  "asset": "ETH" | "STRK"   // For Starknet only, defaults to ETH
}
```

**POST /api/receive response:**
```json
{
  "id": "recv_xxx",
  "qrData": "lnbc1000n1...",  // Lightning invoice, bitcoin:xxx, or starknet address
  "expiresAt": "2024-01-01T00:00:00Z",
  "network": "lightning",
  "amount": 1000
}
```

#### Pay (3 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pay/parse` | Parse QR/payment request → returns payment details |
| `POST` | `/api/pay/execute` | Execute payment (requires WebAuthn) |
| `GET` | `/api/pay/:id` | Get payment status |

**POST /api/pay/parse request:**
```json
{
  "data": "lnbc1000n1..."  // Raw QR content
}
```

**POST /api/pay/parse response:**
```json
{
  "type": "lightning" | "bitcoin" | "starknet",
  "destination": "...",
  "amount": 1000,           // In sats or wei
  "amountEditable": false,  // true if amount not specified in QR
  "description": "...",     // From Lightning invoice memo
  "expiresAt": "..."        // If applicable
}
```

**POST /api/pay/execute request:**
```json
{
  "data": "lnbc1000n1...",   // Original QR data
  "amount": 1000,            // Required if amountEditable was true
  "challengeId": "...",      // From WebAuthn begin flow
  "credential": { ... }      // WebAuthn assertion response
}
```

**POST /api/pay/execute response:**
```json
{
  "id": "pay_xxx",
  "status": "pending"
}
```

#### User (3 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/user/settings` | Get user settings |
| `PUT` | `/api/user/settings` | Update user settings |
| `GET` | `/api/user/transactions` | Get transaction history (paginated) |

#### Utility (2 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/prices` | Get current BTC/ETH/STRK prices in USD |

---

### Backend Internal Flows

#### Receive Lightning Payment
```
POST /api/receive {network: "lightning", amount: 1000}
  └─> Backend creates swap with Atomiq (Starknet → Lightning)
  └─> Stores swap details in DB
  └─> Returns Lightning invoice as QR data

GET /api/receive/:id (frontend polls)
  └─> Backend checks swap status with Atomiq
  └─> If payment received: updates DB, returns "completed"
  └─> Frontend shows success
```

#### Pay Lightning Invoice
```
POST /api/pay/parse {data: "lnbc..."}
  └─> Backend decodes Lightning invoice
  └─> Gets quote from Atomiq
  └─> Returns payment details + estimated fees

POST /api/pay/execute {data, amount, challengeId, credential}
  └─> Backend verifies WebAuthn assertion
  └─> If account.status === "pending": auto-deploy via AVNU paymaster
  └─> Creates swap with Atomiq
  └─> Signs & submits Starknet transaction
  └─> Returns payment ID

GET /api/pay/:id (frontend polls)
  └─> Backend checks swap status
  └─> Returns current status (pending/confirming/completed/failed)
```

#### Auto-deployment Flow
```
User calls POST /api/pay/execute (first payment)
       │
       ▼
Backend checks account.status
       │
       ├─► "deployed" → proceed with payment
       │
       └─► "pending" → auto-deploy first:
              │
              ▼
         Call AVNU paymaster API
              │
              ▼
         Deploy account contract (gasless)
              │
              ▼
         Update account.status = "deployed"
              │
              ▼
         Proceed with payment
```

---

## WebAuthn Implementation Comparison

### Endpoint Mapping (Old → New)

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `POST /api/webauthn/register/begin` | `POST /api/auth/register/begin` | New returns explicit `challengeId` |
| `POST /api/webauthn/register/complete` | `POST /api/auth/register/complete` | New requires `challengeId` in body |
| `POST /api/webauthn/authenticate/begin` | `POST /api/auth/login/begin` | New returns explicit `challengeId` |
| `POST /api/webauthn/authenticate/complete` | `POST /api/auth/login/complete` | New requires `challengeId` in body |
| (implicit via cookie) | `GET /api/auth/session` | New explicit session check |
| `POST /api/auth/logout` | `POST /api/auth/logout` | Same |

### Critical Architecture Change: Challenge Management

**OLD:** Challenge ID stored in HttpOnly cookie (server-managed)
```
1. Server generates challenge → stores in DB → sets challengeId in HttpOnly cookie
2. Client calls WebAuthn API
3. Client submits credential → server reads challengeId from cookie
```

**NEW:** Challenge ID returned explicitly (client-managed)
```
1. Server generates challenge → stores in DB → returns challengeId in response
2. Client stores challengeId → calls WebAuthn API
3. Client submits credential + challengeId in request body
```

### Features Present in Both
- ✅ Challenge TTL (60 seconds)
- ✅ Single-use challenge enforcement
- ✅ Sign counter anti-replay protection
- ✅ RP ID validation
- ✅ Session timeout (7 days)
- ✅ Secure session cookies (HttpOnly, SameSite=Strict, Secure)
- ✅ User verification required

### Features Missing in New Implementation
- ❌ Cookie-stored challenge ID (architectural choice: now explicit parameter - more flexible for multi-platform)
- ✅ ~~Strict username validation regex~~ (implemented via `Username` domain type)
- ❌ Custom CBOR parsing (improvement: now uses SimpleWebAuthn library - more secure, maintained)

### Features Added in New Implementation
- ✅ Account status tracking (pending → deploying → deployed → failed)
- ✅ Starknet address calculated on registration
- ✅ Domain layer separation (entities, use cases, repositories)
- ✅ Branded types for IDs (AccountId, ChallengeId, etc.)
- ✅ Gateway pattern for external services

---

## Database Schema Differences

### Old: `users` table
```sql
- id: uuid (PK)
- username: text (unique)
- credentialId: text (unique, base64url)
- publicKey: text (base64, uncompressed P256 65 bytes)
- credentialPublicKey: text (COSE-encoded)
- signCount: bigint
- rpId: text
- createdAt, updatedAt: timestamp
```

### New: `accounts` table
```sql
- id: uuid (PK)
- username: text (unique)
- credentialId: text (unique, base64url)
- publicKey: text (hex X-coordinate only, 32 bytes)
- credentialPublicKey: text (COSE-encoded)
- signCount: bigint
- rpId: text
- starknetAddress: text (normalized 66-char hex) -- NEW
- status: text ('pending'|'deploying'|'deployed'|'failed') -- NEW
- deploymentTxHash: text -- NEW
- createdAt, updatedAt: timestamp
```

### Migration Notes
- Table renamed: `users` → `accounts`
- New columns: `starknetAddress`, `status`, `deploymentTxHash`
- Public key format changed: base64(65 bytes) → hex(32 bytes X-coordinate)
- Foreign keys renamed: `userId` → `accountId`

---

## Migration Checklist

### Phase 1: Core Auth ✅
- [x] WebAuthn registration flow
- [x] WebAuthn authentication flow
- [x] Session management
- [x] Username validation (stricter regex via `Username` domain type)
- [x] Integration tests (registration + authentication flows)

### Phase 2: Account & User ✅
- [x] Account entity + service (status tracking, Starknet address, balances)
- [x] User settings entity + service (fetch, update)
- [x] Transaction entity + service (paginated)
- [x] WatchedAddress entity + service
- [x] Account API endpoints (me, balance, deploy, deployment-status)
- [x] User API endpoints (settings, transactions)
- [x] Starknet RPC gateway + AVNU paymaster gateway
- [x] Integration tests (account, deployment flow)

### Phase 3: Receive Payments ✅
- [x] `POST /api/payment/receive` (lightning, bitcoin, starknet)
- [x] Receive service + Swap service (domain)
- [x] Atomiq SDK gateway
- [x] Bolt11 Lightning decoder
- [x] Swap monitor (background polling + auto-claim)
- [x] Frontend receive page with QR display

### Phase 4: Pay ✅
- [x] `POST /api/payment/pay/parse` (Lightning, Bitcoin, Starknet)
- [x] `POST /api/payment/pay/execute` (with auto-deployment)
- [x] Parse service, Pay service, ERC20 call factory, fee calculator
- [x] Swap routes (limits, status, claim, SSE events)
- [x] Frontend: pay page, confirm page, success page

### Phase 5: Frontend ✅
- [x] Auth page (register/login)
- [x] Home page (balance, transactions)
- [x] Account setup page (deployment)
- [x] Receive page (network selector, QR)
- [x] Pay page (QR scanner, confirm, success)
- [x] Menu + About pages
- [x] Shared components (amount, currency, buttons, spinner, notifications)
- [x] Auth guard + guest guard

### Phase 6: Remaining Work
- [ ] Settings page (frontend UI — backend endpoints already exist)
- [ ] Real price API integration (currently hardcoded/mocked)
- [ ] Persistent swap repository (currently in-memory, needs Drizzle)
- [ ] `GET /api/receive/:id` status polling (partially covered via swap status endpoint)
- [ ] Error recovery / retry logic for failed payments
- [ ] E2E tests for critical payment flows (receive + pay end-to-end)
- [ ] Rate limiting on API endpoints
- [ ] Structured logging / observability
- [ ] Metrics endpoint (`GET /api/metrics`)
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Webhook endpoints for external services
- [ ] UI polish / minor refinements
- [ ] i18n
- [ ] PWA
- [ ] testnet + mainnet
