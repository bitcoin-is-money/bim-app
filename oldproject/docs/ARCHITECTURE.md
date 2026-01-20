# System Architecture

> **Last Updated**: 2026-01-13
> **Version**: 1.0.0

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Technology Stack](#technology-stack)
4. [Architecture Layers](#architecture-layers)
5. [Core Components](#core-components)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [Service Dependencies](#service-dependencies)
8. [Database Schema](#database-schema)
9. [API Architecture](#api-architecture)
10. [Security Architecture](#security-architecture)
11. [Deployment Architecture](#deployment-architecture)

---

## Executive Summary

**BIM-BIM** is a WebAuthn-based Starknet account deployment system that enables users to create and manage Argent-style smart contract accounts using passkey/biometric authentication. The system integrates Lightning Network and Bitcoin on-chain swaps through the Atomiq SDK, allowing seamless asset movement between Starknet, Lightning, and Bitcoin networks.

**Key Features:**
- 🔐 Passwordless authentication using WebAuthn (passkeys/biometrics)
- ⚡ Lightning Network to Starknet swaps
- ₿ Bitcoin on-chain to Starknet swaps
- 🔄 Starknet to Lightning/Bitcoin reverse swaps
- 🚀 Gasless account deployment via AVNU paymaster
- 📊 Real-time transaction monitoring
- 🌍 Multi-language support (i18n)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                          │
├─────────────────────────────────────────────────────────────────┤
│  SvelteKit Frontend + WebAuthn API + Starknet.js                │
│  • UI Components (62 Svelte components)                          │
│  • Client Services (50+ services)                                │
│  • WebAuthn Credential Management                                │
│  • Lightning Invoice Generation                                  │
└────────────┬────────────────────────────────────────────────────┘
             │ HTTPS/WebSocket
             │
┌────────────▼────────────────────────────────────────────────────┐
│                    SVELTEKIT SERVER (Node.js)                    │
├─────────────────────────────────────────────────────────────────┤
│                      MIDDLEWARE PIPELINE                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Request ID Generation & Logging                        │  │
│  │ 2. Security Headers (CSP, HSTS, X-Frame-Options)         │  │
│  │ 3. CORS Configuration                                     │  │
│  │ 4. Session Validation & User Authentication              │  │
│  │ 5. Rate Limiting (Multi-tier: IP, User, Endpoint)       │  │
│  │ 6. Input Validation & Sanitization                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│                       API ROUTES (50+)                           │
│  ┌──────────────┬──────────────┬──────────────┬─────────────┐  │
│  │ Auth APIs    │ Lightning    │ Bitcoin      │ Starknet    │  │
│  │ /api/auth/*  │ /api/lightning│ /api/bitcoin │ /api/avnu/* │  │
│  │ /api/webauthn│ /api/atomiq  │              │ /api/rpc/*  │  │
│  └──────────────┴──────────────┴──────────────┴─────────────┘  │
│                                                                   │
│                    SERVER SERVICES (30+)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • WebAuthn Verification Service                           │  │
│  │ • Starknet Account Deployment Service                     │  │
│  │ • Atomiq Swap Services (Lightning/Bitcoin)               │  │
│  │ • Swap Monitor & Claim Orchestrator                      │  │
│  │ • Blockchain Scanner (Background Jobs)                    │  │
│  │ • Webhook Handlers & SSE                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────────┬───────────────┘
             │                                    │
    ┌────────▼────────┐                 ┌────────▼──────────┐
    │  PostgreSQL DB  │                 │ External Services │
    │  (Drizzle ORM)  │                 ├───────────────────┤
    ├─────────────────┤                 │ • Starknet RPC    │
    │ • users         │                 │ • AVNU Paymaster  │
    │ • sessions      │                 │ • Atomiq SDK      │
    │ • webauthn_     │                 │ • Pricing APIs    │
    │   challenges    │                 │ • Lightning Net   │
    │ • user_addresses│                 │ • Bitcoin Network │
    │ • user_trans... │                 └───────────────────┘
    │ • user_settings │
    └─────────────────┘
```

---

## Technology Stack

### Frontend
| Technology | Purpose | Version |
|------------|---------|---------|
| **SvelteKit** | Full-stack framework | Latest |
| **TypeScript** | Type safety | 5.x |
| **Vite** | Build tool & dev server | Latest |
| **TailwindCSS** | Styling framework | 3.x |
| **Starknet.js** | Starknet blockchain interaction | Latest |

### Backend
| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | Runtime environment | 22.11.0+ |
| **SvelteKit (SSR)** | Server-side rendering | Latest |
| **Drizzle ORM** | Type-safe database queries | Latest |
| **PostgreSQL** | Primary database | 15+ |

### External SDKs
| SDK | Purpose | Version |
|-----|---------|---------|
| **Atomiq SDK** | Cross-chain swaps (Lightning/Bitcoin ↔ Starknet) | @atomiqlabs/chain-starknet |
| **AVNU SDK** | Gasless paymaster integration | Latest |
| **@noble/curves** | Cryptographic operations (ECDSA) | Latest |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Railway** | PaaS deployment platform |
| **GitHub Actions** | CI/CD pipeline |
| **PostgreSQL (Railway)** | Managed database |

---

## Architecture Layers

### Layer 1: Client Layer (Browser)
**Responsibility**: User interface, WebAuthn credential management, transaction signing

```
src/lib/components/          → 62 Svelte UI components
src/lib/services/client/     → 50+ client-side services
  ├── webauthn.service.ts    → WebAuthn credential operations
  ├── lightning.service.ts   → Lightning invoice handling
  ├── starknet.service.ts    → Starknet transaction building
  └── pricing/               → Multi-provider price fetching
```

**Key Responsibilities:**
- WebAuthn credential creation and assertion
- Transaction signing with WebAuthn
- UI state management
- Client-side validation
- QR code generation for invoices

### Layer 2: API Gateway Layer (SvelteKit Server)
**Responsibility**: Request handling, authentication, rate limiting, validation

```
src/hooks.server.ts          → Main middleware pipeline
src/lib/middleware/
  ├── auth.ts                → Authentication & authorization
  ├── validation.ts          → Input validation schemas
  └── rate-limit.ts          → Multi-tier rate limiting
```

**Request Pipeline:**
```
Request → Generate Request ID
       → Apply Security Headers
       → CORS Configuration
       → Session Validation
       → Rate Limiting Check
       → Input Validation
       → Route Handler
       → Response with Security Headers
```

### Layer 3: Service Layer (Business Logic)
**Responsibility**: Core business logic, blockchain interactions, swap orchestration

```
src/lib/services/server/
  ├── webauthn/              → WebAuthn server verification
  ├── starknet.service.ts    → Starknet account deployment
  ├── atomiq/                → Cross-chain swap services
  │   ├── lightningToStarknet.service.ts
  │   ├── starknetToLightning.service.ts
  │   ├── bitcoin-swaps.service.ts
  │   ├── swap-monitor.service.ts
  │   ├── swap-claimer.service.ts
  │   └── claim/             → Claim orchestration
  ├── blockchain-scanner.service.ts
  └── background-jobs.service.ts
```

### Layer 4: Data Layer (PostgreSQL)
**Responsibility**: Persistent storage, session management, transaction history

```
src/lib/db/schema.ts         → Database schema definitions
drizzle/                     → Migration files
```

---

## Core Components

### 1. Authentication System (WebAuthn)

**Location**: `src/lib/auth/`, `src/lib/utils/webauthn/`

**Components:**
- **Client-side**: `webauthn.service.ts` (credential creation/assertion)
- **Server-side**: `server-verification.ts` (signature verification)
- **Session Management**: `session.ts` (server-side sessions)

**Flow:**
```
[Registration Flow]
Client → GET /api/webauthn/register/begin
      ← Challenge + Options
Client → Create Credential (Browser API)
Client → POST /api/webauthn/register/complete
      → Verify Attestation
      → Store credential in DB
      ← Session Cookie

[Login Flow]
Client → GET /api/webauthn/authenticate/begin
      ← Challenge
Client → Get Assertion (Browser API)
Client → POST /api/webauthn/authenticate/complete
      → Verify Signature
      → Validate User
      ← Session Cookie
```

**Database Tables:**
- `users`: username, credentialId, publicKey, signCount
- `sessions`: sessionId, userId, expiresAt
- `webauthn_challenges`: challenge, purpose, used, expiresAt

### 2. Starknet Account Deployment

**Location**: `src/lib/services/server/starknet.service.ts`, `src/routes/api/avnu/`

**Components:**
- **StarknetService**: Account deployment with WebAuthn signer
- **AVNU Integration**: Gasless deployment via paymaster

**Flow:**
```
[Account Deployment]
Client → POST /api/avnu/deploy-account
      → Calculate contract address
      → Build deployment transaction
      → Sign with WebAuthn
      → Execute via AVNU paymaster
      ← Transaction hash + Account address
      → Monitor transaction status
      ← Deployment confirmation
```

**Key Features:**
- Argent-style account contracts
- WebAuthn + Stark key dual signers
- Gasless deployment (no ETH required)
- Fee estimation with buffer

### 3. Atomiq Cross-Chain Swaps

**Location**: `src/lib/services/server/atomiq/`

**Services:**
- `lightningToStarknet.service.ts` (557 lines)
- `starknetToLightning.service.ts` (557 lines)
- `bitcoin-swaps.service.ts`
- `starknetToBitcoin.service.ts`
- `swap-monitor.service.ts` (446 lines)
- `swap-claimer.service.ts`
- `claim-orchestrator.ts`

**State Management:**
- `swap-registry.ts`: Central swap tracking
- `swap-monitor.service.ts`: Real-time status updates
- In-memory swap object storage

**Key Features:**
- Lightning invoice generation and payment monitoring
- Bitcoin on-chain address generation (BIP-21)
- Automatic claim orchestration
- Timeout and retry logic
- SSE for real-time updates

### 4. Blockchain Scanner

**Location**: `src/lib/services/server/blockchain-scanner.service.ts`

**Purpose**: Monitor registered Starknet addresses for incoming transactions

**Architecture:**
```
Background Job (Every 30s)
  ↓
Fetch Active User Addresses
  ↓
For Each Address:
  - Get current block number
  - Fetch events since last scanned block
  - Filter Transfer events
  - Store in user_transactions table
  - Update lastScannedBlock
```

**Database Tables:**
- `user_addresses`: Registered addresses to monitor
- `user_transactions`: Transaction history

### 5. Pricing Service

**Location**: `src/lib/services/client/pricing/`

**Architecture:**
```
PricingOrchestrator
  ├── CoinGecko Fetcher
  ├── CryptoCompare Fetcher
  └── Cache Layer (15-minute TTL)
```

**Features:**
- Multi-provider fallback
- Client-side caching
- Server-side proxy endpoint
- Currency conversion support

---

## Data Flow Diagrams

### User Registration and Account Deployment

```
┌─────────┐                 ┌──────────┐                ┌──────────┐
│ Browser │                 │  Server  │                │ Starknet │
└────┬────┘                 └─────┬────┘                └─────┬────┘
     │                            │                           │
     │ 1. Register (username)     │                           │
     ├───────────────────────────>│                           │
     │                            │                           │
     │ 2. WebAuthn Challenge      │                           │
     │<───────────────────────────┤                           │
     │                            │                           │
     │ 3. Create Credential       │                           │
     │    (Browser WebAuthn API)  │                           │
     │                            │                           │
     │ 4. Credential Response     │                           │
     ├───────────────────────────>│                           │
     │                            │ 5. Store User in DB       │
     │                            │    (credential + pubkey)  │
     │                            │                           │
     │ 6. Session Cookie          │                           │
     │<───────────────────────────┤                           │
     │                            │                           │
     │ 7. Deploy Account Request  │                           │
     ├───────────────────────────>│                           │
     │                            │                           │
     │                            │ 8. Build Deployment Tx    │
     │                            │    (AVNU Paymaster)       │
     │                            │                           │
     │ 9. Tx to Sign (WebAuthn)   │                           │
     │<───────────────────────────┤                           │
     │                            │                           │
     │ 10. Signed Tx              │                           │
     ├───────────────────────────>│                           │
     │                            │                           │
     │                            │ 11. Submit to Starknet    │
     │                            ├──────────────────────────>│
     │                            │                           │
     │                            │ 12. Tx Hash               │
     │                            │<──────────────────────────┤
     │                            │                           │
     │ 13. Account Address + Hash │                           │
     │<───────────────────────────┤                           │
     │                            │                           │
```

### Lightning to Starknet Swap

```
┌─────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Client │      │  Server  │      │  Atomiq  │      │ Starknet │
└────┬────┘      └─────┬────┘      └─────┬────┘      └─────┬────┘
     │                 │                  │                  │
     │ 1. Create Swap  │                  │                  │
     │    (amount+dest)│                  │                  │
     ├────────────────>│                  │                  │
     │                 │ 2. SDK.swap()    │                  │
     │                 ├─────────────────>│                  │
     │                 │                  │ 3. Generate      │
     │                 │                  │    Invoice       │
     │                 │                  │                  │
     │                 │ 4. Invoice+ID    │                  │
     │                 │<─────────────────┤                  │
     │                 │                  │                  │
     │ 5. Invoice QR   │                  │                  │
     │<────────────────┤                  │                  │
     │                 │                  │                  │
     │ 6. Open SSE     │                  │                  │
     │    (swap status)│                  │                  │
     ├────────────────>│                  │                  │
     │                 │                  │                  │
     │ [User pays LN invoice via wallet]  │                  │
     │                 │                  │                  │
     │                 │                  │ 7. Payment       │
     │                 │                  │    Received      │
     │                 │<─────────────────┤    (webhook)     │
     │                 │                  │                  │
     │                 │ 8. Claim Swap    │                  │
     │                 ├─────────────────>│                  │
     │                 │                  │                  │
     │                 │                  │ 9. Submit Claim  │
     │                 │                  │    Transaction   │
     │                 │                  ├─────────────────>│
     │                 │                  │                  │
     │                 │                  │ 10. Tx Confirmed │
     │                 │                  │<─────────────────┤
     │                 │                  │                  │
     │ 11. SSE Update  │                  │                  │
     │    (completed)  │                  │                  │
     │<────────────────┤                  │                  │
```

### Starknet to Lightning Swap

```
┌─────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Client │      │  Server  │      │  Atomiq  │      │ Starknet │
└────┬────┘      └─────┬────┘      └─────┬────┘      └─────┬────┘
     │                 │                  │                  │
     │ 1. Create Swap  │                  │                  │
     │ (LN invoice+src)│                  │                  │
     ├────────────────>│                  │                  │
     │                 │ 2. ReverseSwap() │                  │
     │                 ├─────────────────>│                  │
     │                 │                  │ 3. Generate      │
     │                 │                  │    Deposit Addr  │
     │                 │                  │                  │
     │                 │ 4. DepositAddr   │                  │
     │                 │    + Swap ID     │                  │
     │                 │<─────────────────┤                  │
     │                 │                  │                  │
     │ 5. Deposit Addr │                  │                  │
     │<────────────────┤                  │                  │
     │                 │                  │                  │
     │ 6. Send WBTC    │                  │                  │
     │    to deposit   │                  │                  │
     │    address      │                  │                  │
     ├────────────────────────────────────┴─────────────────>│
     │                 │                  │                  │
     │                 │                  │ 7. Tx Confirmed  │
     │                 │                  │<─────────────────┤
     │                 │                  │                  │
     │                 │                  │ 8. Pay LN Invoice│
     │                 │                  │    (automatic)   │
     │                 │                  │                  │
     │                 │ 9. Webhook:      │                  │
     │                 │    Completed     │                  │
     │                 │<─────────────────┤                  │
     │                 │                  │                  │
     │ 10. SSE Update  │                  │                  │
     │     (completed) │                  │                  │
     │<────────────────┤                  │                  │
```

---

## Service Dependencies

### Client Services (50+)

```
Client Service Graph:

┌──────────────────────────────────────────────────────────────┐
│                    Client Services Layer                      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  WebAuthn Service ────┐                                      │
│                       ├──> Auth Flow                         │
│  Session Service ─────┘                                      │
│                                                               │
│  Lightning Service ───┐                                      │
│                       ├──> Swap Orchestration                │
│  Bitcoin Service ─────┤                                      │
│                       │                                      │
│  Starknet Service ────┘                                      │
│                                                               │
│  Pricing Orchestrator ──> Multi-Provider Fetcher             │
│     ├─> CoinGecko Fetcher                                    │
│     ├─> CryptoCompare Fetcher                                │
│     └─> Cache Layer                                          │
│                                                               │
│  Validation Utils ────> Shared across all services           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Server Services (30+)

```
Server Service Dependency Map:

┌────────────────────────────────────────────────────────┐
│             Authentication Layer                        │
├────────────────────────────────────────────────────────┤
│  SessionService                                         │
│      ↓                                                  │
│  WebAuthn Server Verification                           │
│      ↓                                                  │
│  User Management (DB)                                   │
└────────────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────┐
│              Starknet Services                          │
├────────────────────────────────────────────────────────┤
│  StarknetService                                        │
│      ├─> Account Deployment                             │
│      ├─> Transaction Building                           │
│      └─> Fee Estimation                                 │
│                                                         │
│  AVNU Service                                           │
│      └─> Paymaster Integration                          │
│                                                         │
│  RPC Service                                            │
│      └─> Blockchain Queries                             │
└────────────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────┐
│           Atomiq Swap Services                          │
├────────────────────────────────────────────────────────┤
│  SDK Initializer                                        │
│      ↓                                                  │
│  Swap Services                                          │
│      ├─> LightningToStarknet                            │
│      ├─> StarknetToLightning                            │
│      ├─> BitcoinSwaps                                   │
│      └─> StarknetToBitcoin                              │
│                                                         │
│  Swap Registry ◄───────┐                                │
│      ↓                 │                                │
│  Swap Monitor          │ (registers swaps)              │
│      ↓                 │                                │
│  Swap Claimer ─────────┘                                │
│      ├─> Claim Orchestrator                             │
│      ├─> Claim Validator                                │
│      └─> Transaction Cleaner                            │
└────────────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────┐
│         Background Services                             │
├────────────────────────────────────────────────────────┤
│  Background Jobs Service                                │
│      └─> Blockchain Scanner Service                     │
│            └─> Monitors user_addresses table            │
│                └─> Updates user_transactions table      │
└────────────────────────────────────────────────────────┘
```

**Critical Dependencies:**

| Service | Depends On | Purpose |
|---------|------------|---------|
| All API Routes | `SessionService` | User authentication |
| Atomiq Services | `SDK Initializer` | Cross-chain swaps |
| Swap Claimer | `Swap Registry` | Swap object retrieval |
| Swap Monitor | `Swap Registry` | Status tracking |
| Blockchain Scanner | `user_addresses` table | Transaction monitoring |
| AVNU Service | `StarknetService` | Account deployment |

---

## Database Schema

**Schema Location**: `src/lib/db/schema.ts`

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         users                                    │
├─────────────────────────────────────────────────────────────────┤
│ PK │ id                    UUID                                  │
│    │ username              TEXT     UNIQUE                       │
│    │ credentialId          TEXT     UNIQUE                       │
│    │ publicKey             TEXT                                  │
│    │ credentialPublicKey   TEXT                                  │
│    │ signCount             BIGINT                                │
│    │ rpId                  TEXT                                  │
│    │ createdAt             TIMESTAMP                             │
│    │ updatedAt             TIMESTAMP                             │
└─────────────────────────────────────────────────────────────────┘
         │                           │                   │
         │                           │                   │
         │ 1:N                       │ 1:N               │ 1:1
         ▼                           ▼                   ▼
┌──────────────────┐   ┌─────────────────────┐   ┌─────────────────┐
│    sessions      │   │  user_addresses     │   │  user_settings  │
├──────────────────┤   ├─────────────────────┤   ├─────────────────┤
│PK│ id      TEXT  │   │PK│ id          UUID │   │PK│ id      UUID │
│FK│ userId  UUID ─┤   │FK│ userId      UUID─┤   │FK│ userId  UUID─┤
│  │ expiresAt     │   │  │ starknetAddress  │   │  │ fiatCurrency │
│  │ createdAt     │   │  │ addressType      │   │  │ createdAt    │
└──────────────────┘   │  │ isActive         │   │  │ updatedAt    │
                       │  │ registeredAt     │   └─────────────────┘
                       │  │ lastScannedBlock │
                       └─────────────────────┘
                                  │
                                  │ 1:N
                                  ▼
                       ┌────────────────────────┐
                       │  user_transactions     │
                       ├────────────────────────┤
                       │PK│ id             UUID │
                       │FK│ userAddressId  UUID─┤
                       │  │ transactionHash     │
                       │  │ blockNumber         │
                       │  │ transactionType     │
                       │  │ amount              │
                       │  │ tokenAddress        │
                       │  │ fromAddress         │
                       │  │ toAddress           │
                       │  │ timestamp           │
                       │  │ processedAt         │
                       └────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│               webauthn_challenges                           │
├────────────────────────────────────────────────────────────┤
│PK│ id          UUID                                         │
│  │ challenge   TEXT                                         │
│  │ purpose     TEXT  ('registration' | 'authentication')   │
│FK│ userId      UUID  (nullable)                             │
│  │ rpId        TEXT                                         │
│  │ origin      TEXT                                         │
│  │ used        BOOLEAN                                      │
│  │ expiresAt   TIMESTAMP                                    │
│  │ createdAt   TIMESTAMP                                    │
└────────────────────────────────────────────────────────────┘
```

### Table Descriptions

#### `users`
Stores user accounts and WebAuthn credentials.

**Key Fields:**
- `credentialId`: WebAuthn credential identifier (base64url)
- `publicKey`: ECDSA public key for signature verification
- `credentialPublicKey`: COSE-encoded public key (for SimpleWebAuthn)
- `signCount`: Replay protection counter

#### `sessions`
Manages user authentication sessions.

**Key Fields:**
- `id`: Session UUID (stored in cookie)
- `expiresAt`: Session expiration (7 days default)

#### `webauthn_challenges`
Stores short-lived challenges for WebAuthn ceremonies.

**Key Fields:**
- `challenge`: Base64url-encoded random challenge
- `purpose`: Registration or authentication
- `used`: Single-use enforcement
- `expiresAt`: Challenge expiration (60 seconds)

#### `user_addresses`
Tracks registered Starknet addresses for transaction monitoring.

**Key Fields:**
- `starknetAddress`: Address to monitor (hex format)
- `isActive`: Whether monitoring is enabled
- `lastScannedBlock`: Last blockchain block checked

#### `user_transactions`
Stores transaction history for registered addresses.

**Key Fields:**
- `transactionType`: "receipt" (incoming) or "spent" (outgoing)
- `amount`: Transaction amount as string (precision)
- `tokenAddress`: ERC-20 contract address

#### `user_settings`
User preferences and configuration.

**Key Fields:**
- `fiatCurrency`: Preferred currency (USD, EUR, etc.)

---

## API Architecture

### API Organization

```
/api/
  ├── auth/                    [Authentication Endpoints]
  │   ├── register             POST - User registration
  │   ├── login                POST - User login
  │   └── logout               POST - User logout
  │
  ├── webauthn/                [WebAuthn Ceremony Endpoints]
  │   ├── register/
  │   │   ├── begin            GET  - Start registration
  │   │   └── complete         POST - Complete registration
  │   └── authenticate/
  │       ├── begin            GET  - Start authentication
  │       └── complete         POST - Complete authentication
  │
  ├── lightning/               [Lightning Network Swaps]
  │   ├── create-invoice       POST - Create LN to Starknet swap
  │   ├── create-starknet-to-lightning  POST - Create reverse swap
  │   ├── swap-status/[id]     GET  - Get swap status
  │   ├── claim-swap/[id]      POST - Claim completed swap
  │   ├── limits               GET  - Get swap limits
  │   └── webhook              GET  - SSE for swap updates
  │
  ├── bitcoin/                 [Bitcoin On-chain Swaps]
  │   ├── create-swap          POST - Create BTC to Starknet swap
  │   ├── create-starknet-to-bitcoin  POST - Create reverse swap
  │   ├── swap-status/[id]     GET  - Get swap status
  │   └── recover-swap/[id]    GET  - Recover swap info
  │
  ├── avnu/                    [Starknet Account Deployment]
  │   ├── deploy-account       POST - Deploy with paymaster
  │   ├── build-paymaster-transaction  POST - Build tx
  │   └── execute-paymaster-transaction POST - Execute tx
  │
  ├── rpc/                     [Starknet RPC Proxy]
  │   ├── balance              POST - Get token balance
  │   ├── nonce                POST - Get account nonce
  │   ├── estimate-fee         POST - Estimate transaction fee
  │   └── wait-transaction     POST - Wait for tx confirmation
  │
  ├── user/                    [User Management]
  │   ├── me                   GET  - Get current user
  │   ├── settings             GET/PUT - User settings
  │   ├── addresses            GET  - Get registered addresses
  │   ├── addresses/register   POST - Register address
  │   └── transactions         GET  - Get transaction history
  │
  ├── pricing/                 [Price Data]
  │   └── price                GET  - Get token prices
  │
  ├── health                   GET  - Health check with DB status
  └── metrics                  GET  - Application metrics
```

### Endpoint Protection Levels

Defined in `src/lib/middleware/auth.ts`:

| Protection Level | Rate Limit | Auth Required | Use Case |
|-----------------|------------|---------------|----------|
| `auth` | 5/min | ❌ No | Login, registration |
| `webauthn` | 15/min | ❌ No | WebAuthn ceremonies |
| `financial` | 10/5min | ✅ Yes | Lightning/Bitcoin swaps |
| `protected` | 100/min | ✅ Yes | General API endpoints |
| `public` | 200/min | ❌ No | Health checks, metrics |
| `rpc` | 50/min | ❌ No | RPC proxy (public by design) |

---

## Security Architecture

### Middleware Pipeline

Request flow through security layers:

```
1. Request ID Generation
   ↓
2. Security Headers (CSP, HSTS, X-Frame-Options)
   ↓
3. CORS Configuration
   ↓
4. Session Validation
   ↓
5. Rate Limiting (IP + Endpoint + User)
   ↓
6. Input Validation
   ↓
7. Route Handler
   ↓
8. Response with Headers
```

### Security Headers

**Location**: `src/lib/utils/security.ts`

```typescript
Content-Security-Policy: (WebAuthn-compatible)
  - script-src: 'self', 'unsafe-inline', 'unsafe-eval'
  - connect-src: RPC URLs, pricing APIs
  - img-src: 'self', data:, blob:

Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(self)  [for QR scanning]
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

### Rate Limiting Architecture

**Location**: `src/lib/utils/network/rate-limit.ts`

```
Rate Limiter:
  ├── IP-based buckets (prevents IP flooding)
  ├── User-based buckets (authenticated users)
  ├── Endpoint-specific limits
  └── Progressive penalties (exponential backoff)

Limitations:
  - In-memory storage (not shared across replicas)
  - Resets on server restart
  - See SEC_REVIEW.md for Redis migration recommendation
```

### Authentication Flow

**Session Management**: Server-side sessions with PostgreSQL storage

```
Cookie: session_id (HttpOnly, Secure, SameSite=Strict)
  ↓
Session Validation:
  - Lookup in sessions table
  - Check expiresAt timestamp
  - Load user data
  ↓
event.locals.user = user object
```

---

## Deployment Architecture

### Railway Deployment

```
┌───────────────────────────────────────────────────────────┐
│                    Railway Platform                        │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Node.js Application                     │    │
│  │  • SvelteKit (SSR + API)                         │    │
│  │  • Node adapter (server mode)                    │    │
│  │  • Port: $PORT (Railway-managed)                 │    │
│  │  • Health check: /api/health                     │    │
│  └─────────────────┬────────────────────────────────┘    │
│                    │                                      │
│                    │ DATABASE_URL                         │
│                    ▼                                      │
│  ┌──────────────────────────────────────────────────┐    │
│  │       PostgreSQL Database (Railway)               │    │
│  │  • SSL connection enforced                        │    │
│  │  • Connection pooling                             │    │
│  │  • Automatic backups                              │    │
│  └──────────────────────────────────────────────────┘    │
│                                                            │
│  External Connections:                                    │
│  • Starknet RPC (STARKNET_RPC_URL)                       │
│  • AVNU Paymaster API                                     │
│  • Atomiq SDK intermediaries                              │
│  • CoinGecko / CryptoCompare (pricing)                   │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

### Environment Variables

**Critical Configuration**:
```bash
# Database
DATABASE_URL=postgresql://...?sslmode=require

# Session Security
SESSION_SECRET=<64-char secret>

# Starknet
STARKNET_RPC_URL=https://...
PUBLIC_DEPLOYER_ADDRESS=0x...
PUBLIC_DEPLOYER_PRIVATE_KEY=0x...

# Bitcoin Network
BITCOIN_NETWORK=mainnet|testnet

# Atomiq (Optional)
ATOMIQ_INTERMEDIARY_URLS=https://...
ATOMIQ_WEBHOOK_URL=https://...

# Application
NODE_ENV=production
```

### Prestart Hook

**File**: `package.json` → `scripts.prestart`

```bash
prestart: npm run migrate:prod
```

Automatically runs database migrations before application start on Railway.

---

## Performance Considerations

### Caching Strategy

1. **Pricing Data**: 15-minute client-side cache
2. **Account Address Calculation**: In-memory cache (Starknet service)
3. **Swap Objects**: In-memory registry (lifetime: until claim/expiry)

### Database Optimization

- Indexed columns: `username`, `credentialId`, `session.userId`
- Connection pooling via Drizzle
- Parameterized queries (SQL injection prevention)

### Background Jobs

**Blockchain Scanner**:
- Frequency: Every 30 seconds
- Scans only active addresses (`isActive = true`)
- Processes 10 blocks per scan cycle
- Stores minimal transaction data

---

## Development vs Production

### Development Mode
- Debug logging enabled
- Hot module reloading (Vite)
- Debug endpoints available (`/api/debug/*`)
- In-memory rate limiting
- Local PostgreSQL

### Production Mode
- Structured logging (JSON)
- Security headers enforced
- Debug endpoints disabled
- HTTPS-only cookies
- SSL database connections
- Railway automatic migrations

---

## Key Files Reference

| Path | Purpose |
|------|---------|
| `src/hooks.server.ts` | Main middleware pipeline (330 lines) |
| `src/lib/auth/session.ts` | Session management |
| `src/lib/middleware/auth.ts` | Endpoint protection |
| `src/lib/services/server/atomiq/` | Swap services (3500+ lines) |
| `src/lib/db/schema.ts` | Database schema (387 lines) |
| `src/lib/utils/security.ts` | Security headers & CSP |
| `src/lib/utils/webauthn/server-verification.ts` | WebAuthn verification |

---

## Next Steps for New Developers

1. Read [SECURITY_MODEL.md](./SECURITY_MODEL.md) for security context
2. Read [ATOMIQ_SWAPS.md](./ATOMIQ_SWAPS.md) for swap flow details
3. Run `npm run dev` and explore `/api/health` endpoint
4. Test WebAuthn registration flow in Chrome/Safari
5. Review `src/hooks.server.ts` to understand request pipeline
6. Explore Drizzle Studio: `npm run db:studio`

---

## Questions?

For architecture clarifications, check:
- [ATOMIQ_SWAPS.md](./ATOMIQ_SWAPS.md) - Swap state machines
- [SECURITY_MODEL.md](./SECURITY_MODEL.md) - Security findings
- [README.md](../README.md) - Setup instructions
- [AGENTS.md](../AGENTS.md) - Development guidelines
