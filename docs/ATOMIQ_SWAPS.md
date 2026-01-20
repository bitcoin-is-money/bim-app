# Atomiq Cross-Chain Swaps

> **Last Updated**: 2026-01-13
> **Version**: 1.0.0
> **SDK**: @atomiqlabs/chain-starknet

## Table of Contents

1. [Overview](#overview)
2. [Swap Directions](#swap-directions)
3. [State Machines](#state-machines)
4. [Service Architecture](#service-architecture)
5. [Detailed Swap Flows](#detailed-swap-flows)
6. [Claim Orchestration](#claim-orchestration)
7. [Error Handling](#error-handling)
8. [Timeout & Retry Logic](#timeout--retry-logic)
9. [Real-Time Updates](#real-time-updates)
10. [Common Issues & Troubleshooting](#common-issues--troubleshooting)

---

## Overview

The Atomiq SDK integration enables bidirectional swaps between three networks:

```
    ⚡ Lightning Network
         ↕
    🔷 Starknet (WBTC)
         ↕
    ₿ Bitcoin On-chain
```

**Supported Asset**: WBTC (Wrapped Bitcoin on Starknet)

**Key Services** (Location: `src/lib/services/server/atomiq/`):
- `lightningToStarknet.service.ts` (557 lines)
- `starknetToLightning.service.ts` (557 lines)
- `bitcoin-swaps.service.ts`
- `starknetToBitcoin.service.ts`
- `swap-monitor.service.ts` (446 lines)
- `swap-claimer.service.ts`
- `claim-orchestrator.ts`

---

## Swap Directions

### 1. Lightning → Starknet (Forward Swap)
**Use Case**: Convert Lightning BTC to WBTC on Starknet

**User Journey**:
1. User specifies amount in sats + destination Starknet address
2. Server generates Lightning invoice via Atomiq SDK
3. User pays invoice with their Lightning wallet
4. Server detects payment and claims WBTC to Starknet address

### 2. Bitcoin On-chain → Starknet (Forward Swap)
**Use Case**: Convert on-chain BTC to WBTC on Starknet

**User Journey**:
1. User specifies amount in sats + destination Starknet address
2. Server generates Bitcoin deposit address (BIP-21)
3. User sends BTC to deposit address
4. After confirmations, server claims WBTC to Starknet address

### 3. Starknet → Lightning (Reverse Swap)
**Use Case**: Convert WBTC on Starknet to Lightning BTC

**User Journey**:
1. User provides Lightning invoice + source Starknet address
2. Server creates reverse swap with deposit address on Starknet
3. User sends WBTC to Starknet deposit address
4. Atomiq SDK automatically pays Lightning invoice

### 4. Starknet → Bitcoin On-chain (Reverse Swap)
**Use Case**: Convert WBTC on Starknet to on-chain BTC

**User Journey**:
1. User provides Bitcoin address + source Starknet address
2. Server creates reverse swap with deposit address on Starknet
3. User sends WBTC to Starknet deposit address
4. After confirmations, BTC sent to user's Bitcoin address

---

## State Machines

### Lightning-to-Starknet State Machine (FromBTCLNSwapState)

Based on Atomiq SDK documentation:

```
┌─────────────────────────────────────────────────────────────────┐
│                  Lightning → Starknet States                     │
└─────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │  PR_CREATED │  State: 0
    │  (pending)  │  → Invoice created, waiting for payment
    └──────┬──────┘
           │
           │ User pays Lightning invoice
           ▼
    ┌─────────────┐
    │   PR_PAID   │  State: 1
    │   (paid)    │  → Payment received, ready to claim
    └──────┬──────┘
           │
           │ Server initiates claim transaction
           ▼
    ┌─────────────────┐
    │ CLAIM_COMMITED  │  State: 2
    │  (confirming)   │  → Claim transaction submitted to Starknet
    └──────┬──────────┘
           │
           │ Transaction confirmed on Starknet
           ▼
    ┌─────────────────┐
    │ CLAIM_CLAIMED   │  State: 3
    │  (completed)    │  → WBTC successfully transferred
    └─────────────────┘


Failure States (Negative):
  -4: FAILED          → Permanent failure
  -3: QUOTE_EXPIRED   → Quote expired, cannot proceed
  -2: QUOTE_SOFT_EXPIRED → May recover, continue monitoring
  -1: EXPIRED         → Invoice expired without payment
```

**State Transition Code** (`src/lib/services/server/atomiq/types.ts:278-299`):

```typescript
if (swapDirection === 'lightning_to_starknet') {
  switch (swapState) {
    case 0: return 'pending';      // PR_CREATED
    case 1: return 'paid';          // PR_PAID
    case 2: return 'confirming';    // CLAIM_COMMITED
    case 3: return 'completed';     // CLAIM_CLAIMED
  }
}
```

### Starknet-to-Lightning/Bitcoin State Machine (ToBTCSwapState)

```
┌─────────────────────────────────────────────────────────────────┐
│              Starknet → Lightning/Bitcoin States                 │
└─────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │   CREATED   │  State: 0
    │  (pending)  │  → Quote created, waiting to execute
    └──────┬──────┘
           │
           │ User sends WBTC to deposit address
           ▼
    ┌─────────────────┐
    │   COMMITED      │  State: 1
    │ (waiting_payment)│ → Init transaction sent, confirming
    └──────┬──────────┘
           │
           │ Transaction confirmed
           ▼
    ┌─────────────────┐
    │  SOFT_CLAIMED   │  State: 2
    │  (confirming)   │  → Processed but not claimed on-chain
    └──────┬──────────┘
           │
           │ Finalized on destination chain
           ▼
    ┌─────────────────┐
    │    CLAIMED      │  State: 3
    │  (completed)    │  → BTC sent to destination
    └─────────────────┘

    Optional State:
    ┌─────────────────┐
    │   REFUNDABLE    │  State: 4
    │    (paid)       │  → Can be refunded (ready for refund action)
    └─────────────────┘


Failure States (Negative) - Bitcoin Swaps:
  -4: PERMANENT_FAILURE    → Unrecoverable error
  -3: REFUNDED             → Original quote expired, funds refunded
  -2: QUOTE_EXPIRED        → Quote expired normally
  -1: QUOTE_SOFT_EXPIRED   → May recover, continue monitoring
```

**State Transition Code** (`src/lib/services/server/atomiq/types.ts:300-315`):

```typescript
if (swapDirection === 'starknet_to_lightning' ||
    swapDirection === 'starknet_to_bitcoin') {
  switch (swapState) {
    case 0: return 'pending';          // CREATED
    case 1: return 'waiting_payment';  // COMMITED
    case 2: return 'confirming';       // SOFT_CLAIMED
    case 3: return 'completed';        // CLAIMED
    case 4: return 'paid';             // REFUNDABLE
  }
}
```

### State Mapping Table

| SDK State | Lightning → Starknet | Starknet → Lightning/Bitcoin | Status |
|-----------|---------------------|------------------------------|--------|
| **0** | `pending` (PR_CREATED) | `pending` (CREATED) | Waiting for user action |
| **1** | `paid` (PR_PAID) | `waiting_payment` (COMMITED) | Payment processing |
| **2** | `confirming` (CLAIM_COMMITED) | `confirming` (SOFT_CLAIMED) | Blockchain confirmation |
| **3** | `completed` (CLAIM_CLAIMED) | `completed` (CLAIMED) | Successfully completed |
| **4** | N/A | `paid` (REFUNDABLE) | Refund available |
| **-1** | `expired` (EXPIRED) | `pending` (SOFT_EXPIRED) | Failed/Expired |
| **-2** | `expired` (QUOTE_SOFT_EXPIRED) | `expired` (QUOTE_EXPIRED) | Failed/Expired |
| **-3** | `expired` (QUOTE_EXPIRED) | `expired` (REFUNDED) | Failed/Expired |
| **-4** | `failed` (FAILED) | `failed` (PERMANENT_FAILURE) | Failed/Expired |

---

## Service Architecture

### Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    Atomiq Service Layer                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │           SDK Initialization Layer                        │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │  SDKInitializerService                                    │ │
│  │    • Initializes Atomiq SDK with config                  │ │
│  │    • Validates token availability                        │ │
│  │    • Returns swapper & swapperFactory                    │ │
│  │                                                           │ │
│  │  AtomiqConfigService                                     │ │
│  │    • Loads environment configuration                     │ │
│  │    • Validates RPC URLs and network settings             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                 Swap Creation Layer                       │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │  LightningToStarknetService                              │ │
│  │    → Creates Lightning invoice swaps                     │ │
│  │                                                           │ │
│  │  StarknetToLightningService                              │ │
│  │    → Creates reverse swaps with deposit addresses        │ │
│  │                                                           │ │
│  │  BitcoinSwapsService                                     │ │
│  │    → Creates Bitcoin on-chain swaps                      │ │
│  │                                                           │ │
│  │  StarknetToBitcoinService                                │ │
│  │    → Creates Starknet to Bitcoin swaps                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Swap Registry & Monitoring                   │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │  SwapRegistry                                            │ │
│  │    • Central in-memory swap storage                      │ │
│  │    • Maps swapId → { swap, direction, metadata }        │ │
│  │    • Provides getSwapInfo() for status checks           │ │
│  │                                                           │ │
│  │  SwapMonitorService                                      │ │
│  │    • Monitors swap payment status                        │ │
│  │    • Tracks paid-but-not-claimed swaps                   │ │
│  │    • Provides real-time status updates                   │ │
│  │    • Handles deposit tracking for Bitcoin swaps          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Claim Orchestration Layer                    │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │  SwapClaimerService                                      │ │
│  │    • Main entry point for claim operations               │ │
│  │    • Coordinates with ClaimOrchestrator                  │ │
│  │    • Handles background payment monitoring               │ │
│  │                                                           │ │
│  │  ClaimOrchestrator                                       │ │
│  │    • Orchestrates claim process                          │ │
│  │    • Coordinates validation, cleaning, execution         │ │
│  │    • Manages timeout logic                               │ │
│  │                                                           │ │
│  │  ClaimValidator                                          │ │
│  │    • Validates swap state before claiming                │ │
│  │    • Checks SDK method availability                      │ │
│  │                                                           │ │
│  │  TransactionCleaner                                      │ │
│  │    • Cleans transaction objects before submission        │ │
│  │    • Removes BigInt fields for JSON compatibility        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Service Methods

#### LightningToStarknetService

```typescript
class LightningToStarknetService {
  // Create a Lightning invoice swap
  async createLightningToStarknetSwap(
    request: LightningSwapRequest
  ): Promise<LightningSwapResponse & { swapObject?: any }>

  // Key operations:
  // 1. Validate SDK state
  // 2. Get tokens from SDK (BTCLN → WBTC)
  // 3. Call swapper.swap() with exactIn=true
  // 4. Extract invoice via swap.getHyperlink()
  // 5. Register swap in registry
  // 6. Return invoice + swap metadata
}
```

#### StarknetToLightningService

```typescript
class StarknetToLightningService {
  // Create a reverse swap (Starknet → Lightning)
  async createStarknetToLightningSwap(
    request: StarknetToLightningSwapRequest
  ): Promise<StarknetToLightningSwapResponse & { swapObject?: any }>

  // Key operations:
  // 1. Validate Lightning invoice
  // 2. Get tokens (WBTC → BTCLN)
  // 3. Call swapper.swap() with exactIn=false, amount=undefined
  // 4. Get Starknet deposit address via swap.getAddress()
  // 5. Return deposit address + swap metadata
}
```

#### SwapMonitorService

```typescript
class SwapMonitorService {
  // Register a swap for monitoring
  registerSwap(swapId: string, swap: any): void

  // Get current swap status
  getSwapStatus(swapId: string): SwapStatusUpdate | null

  // Mark swap as paid (for Lightning swaps)
  markSwapAsPaid(swapId: string): void

  // Check if swap is paid but not claimed
  isPaidButNotClaimed(swapId: string): boolean

  // Track Bitcoin deposit confirmation
  markDepositConfirmed(swapId: string, depositAddress: string): void
}
```

#### ClaimOrchestrator

```typescript
class ClaimOrchestrator {
  // Claim a Lightning swap after payment
  async claimLightningSwap(
    swap: any,
    swapId: string,
    starknetSigner?: any,
    isPaidInBackground: boolean = false
  ): Promise<ClaimResult>

  // Get unsigned claim transactions (for manual signing)
  async getUnsignedClaimTransactions(
    swap: any,
    swapId: string
  ): Promise<{ success: boolean; transactions?: any[]; message: string }>

  // Submit signed transactions
  async submitSignedTransactions(
    swap: any,
    swapId: string,
    signedTransactions: any[]
  ): Promise<ClaimResult>
}
```

---

## Detailed Swap Flows

### Flow 1: Lightning → Starknet (Forward Swap)

**File**: `src/lib/services/server/atomiq/lightningToStarknet.service.ts`

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client │     │  Server  │     │  Atomiq  │     │ Starknet │
└────┬────┘     └─────┬────┘     └─────┬────┘     └─────┬────┘
     │                │                │                │
     │ POST /api/lightning/create-invoice                │
     │ { amount, destination }         │                │
     ├───────────────>│                │                │
     │                │                │                │
     │                │ 1. Validate input                │
     │                │                │                │
     │                │ 2. SDK.swap(   │                │
     │                │    BTCLN,      │                │
     │                │    WBTC,       │                │
     │                │    amount,     │                │
     │                │    exactIn=true)│               │
     │                ├───────────────>│                │
     │                │                │                │
     │                │                │ 3. Generate    │
     │                │                │    Lightning   │
     │                │                │    invoice     │
     │                │                │                │
     │                │ 4. swap object │                │
     │                │<───────────────┤                │
     │                │                │                │
     │                │ 5. Register swap                │
     │                │    in registry │                │
     │                │                │                │
     │                │ 6. Register swap                │
     │                │    in monitor  │                │
     │                │                │                │
     │ 7. Invoice QR  │                │                │
     │<───────────────┤                │                │
     │                │                │                │
     │ 8. Open SSE connection          │                │
     │    /api/lightning/webhook?swapId │               │
     ├───────────────>│                │                │
     │                │                │                │
     │<───────────────┤ SSE: status=pending             │
     │                │                │                │
     │                                                  │
     │ [User pays invoice with LN wallet]              │
     │                                                  │
     │                │                │ 9. Payment     │
     │                │                │    received    │
     │                │                │    (webhook)   │
     │                │<───────────────┤                │
     │                │                │                │
     │                │ 10. markSwapAsPaid()            │
     │                │                │                │
     │<───────────────┤ SSE: status=paid                │
     │                │                │                │
     │ POST /api/lightning/claim-swap/[swapId]         │
     ├───────────────>│                │                │
     │                │                │                │
     │                │ 11. Wait for   │                │
     │                │     payment    │                │
     │                │     (if needed)│                │
     │                │                │                │
     │                │ 12. claim()    │                │
     │                ├───────────────>│                │
     │                │                │                │
     │                │                │ 13. Submit tx  │
     │                │                │    to Starknet │
     │                │                ├───────────────>│
     │                │                │                │
     │<───────────────┤ SSE: status=confirming          │
     │                │                │                │
     │                │                │ 14. Tx confirmed│
     │                │                │<───────────────┤
     │                │                │                │
     │<───────────────┤ SSE: status=completed           │
     │                │                │                │
```

**Key Steps:**

1. **Invoice Creation** (`createLightningToStarknetSwap`)
   - Calls `swapper.swap(Tokens.BITCOIN.BTCLN, Tokens.STARKNET.WBTC, amount, true, null, starknetAddress)`
   - `exactIn=true` means user specifies Lightning amount
   - Returns swap object with invoice

2. **Invoice Retrieval**
   - `swap.getHyperlink()` returns BIP-21 URI with Lightning invoice
   - Parse invoice from URI: `lightning:lnbc...`

3. **Payment Monitoring**
   - Background loop checks `swap.getState()` every 5 seconds
   - When state changes from 0 → 1 (PR_PAID), call `markSwapAsPaid()`
   - SSE broadcasts status update to client

4. **Claim Process**
   - User triggers claim via `/api/lightning/claim-swap/[swapId]`
   - Server calls `swap.claim()` (automatic) or builds transactions (manual)
   - Submit claim transaction to Starknet
   - Wait for confirmation

**Timeout Configuration** (`src/lib/services/server/atomiq/config.ts:19`):
```typescript
timeout: 300000  // 5 minutes for Lightning payments
```

### Flow 2: Starknet → Lightning (Reverse Swap)

**File**: `src/lib/services/server/atomiq/starknetToLightning.service.ts`

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client │     │  Server  │     │  Atomiq  │     │ Starknet │
└────┬────┘     └─────┬────┘     └─────┬────┘     └─────┬────┘
     │                │                │                │
     │ POST /api/lightning/create-starknet-to-lightning │
     │ { invoice, sourceAddress }      │                │
     ├───────────────>│                │                │
     │                │                │                │
     │                │ 1. Parse invoice amount         │
     │                │                │                │
     │                │ 2. SDK.swap(   │                │
     │                │    WBTC,       │                │
     │                │    BTCLN,      │                │
     │                │    undefined,  │  ← amount determined by invoice
     │                │    exactIn=false,│              │
     │                │    sourceAddr, │                │
     │                │    invoice)    │                │
     │                ├───────────────>│                │
     │                │                │                │
     │                │                │ 3. Generate    │
     │                │                │    deposit     │
     │                │                │    address     │
     │                │                │                │
     │                │ 4. swap object │                │
     │                │<───────────────┤                │
     │                │                │                │
     │                │ 5. getAddress()│                │
     │                ├───────────────>│                │
     │                │                │                │
     │                │ 6. Starknet    │                │
     │                │    deposit addr│                │
     │                │<───────────────┤                │
     │                │                │                │
     │ 7. Deposit Address              │                │
     │<───────────────┤                │                │
     │                │                │                │
     │ 8. Open SSE    │                │                │
     ├───────────────>│                │                │
     │                │                │                │
     │<───────────────┤ SSE: status=pending             │
     │                │                │                │
     │                                                  │
     │ [User sends WBTC from wallet]                   │
     │ ───────────────────────────────────────────────>│
     │                │                │                │
     │                │                │ 9. Tx detected │
     │                │                │<───────────────┤
     │                │                │                │
     │<───────────────┤ SSE: status=waiting_payment     │
     │                │                │                │
     │                │                │ 10. Tx confirmed│
     │                │                │<───────────────┤
     │                │                │                │
     │                │                │ 11. Pay LN     │
     │                │                │     invoice    │
     │                │                │     (automatic)│
     │                │                │                │
     │<───────────────┤ SSE: status=confirming          │
     │                │                │                │
     │                │                │ 12. Payment    │
     │                │                │     confirmed  │
     │                │                │                │
     │<───────────────┤ SSE: status=completed           │
     │                │                │                │
```

**Key Differences from Forward Swap:**

1. **Amount Handling**
   - `amount` parameter is `undefined`
   - Amount is determined by the Lightning invoice
   - `exactIn=false` because output (Lightning) amount is known

2. **Deposit Address**
   - `swap.getAddress()` returns Starknet contract address
   - User sends WBTC to this address to initiate swap
   - No claim action needed - Atomiq SDK automatically handles it

3. **Automatic Processing**
   - Once WBTC is received, Atomiq automatically pays the Lightning invoice
   - No manual claim step required

### Flow 3: Bitcoin → Starknet (On-chain Forward Swap)

**File**: `src/lib/services/server/atomiq/bitcoin-swaps.service.ts`

Similar to Lightning flow but:
- Returns Bitcoin address instead of invoice
- BIP-21 URI: `bitcoin:address?amount=0.001`
- Requires on-chain confirmations (slower)
- Same claim process as Lightning

### Flow 4: Starknet → Bitcoin (On-chain Reverse Swap)

**File**: `src/lib/services/server/atomiq/starknetToBitcoin.service.ts`

Similar to Starknet → Lightning but:
- User provides Bitcoin address instead of invoice
- Returns Starknet deposit address
- Automatic processing after WBTC deposit
- Bitcoin sent to user's address

**Special Handling** (`swap-monitor.service.ts:98-110`):
```typescript
// Bitcoin swaps have different failure semantics
if (swapDirection === 'starknet_to_bitcoin' &&
    (status === 'expired' || swapState === -1)) {
  const depositInfo = this.depositTrackingSwaps.get(swapId);
  if (depositInfo?.confirmedDeposit) {
    // Override expired status if deposit confirmed
    status = 'pending';
  }
}
```

This prevents showing "expired" when the user has already sent WBTC.

---

## Claim Orchestration

### Claim Process Overview

**Location**: `src/lib/services/server/atomiq/claim/claim-orchestrator.ts`

```
┌───────────────────────────────────────────────────────────────┐
│                  Claim Orchestration Flow                      │
└───────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │  Client Request │
    │  POST /api/     │
    │  lightning/     │
    │  claim-swap/[id]│
    └────────┬────────┘
             │
             ▼
    ┌───────────────────┐
    │ SwapClaimerService │ (Entry point)
    └────────┬──────────┘
             │
             │ 1. Get swap from registry
             ▼
    ┌─────────────────────┐
    │  ClaimOrchestrator  │ (Coordination)
    └────────┬────────────┘
             │
             │ 2. Validate swap state
             ▼
    ┌─────────────────┐
    │ ClaimValidator  │
    │  • Check swap   │
    │  • Check state  │
    │  • Check methods│
    └────────┬────────┘
             │
             │ 3. Wait for payment (if needed)
             ▼
    ┌───────────────────┐
    │  waitForPayment() │
    │  • Poll state     │
    │  • 5-min timeout  │
    └────────┬──────────┘
             │
             │ 4. Perform claim
             ▼
    ┌──────────────────────┐
    │   Automatic Claim    │
    │   swap.claim()       │
    │   OR                 │
    │   Manual Claim       │
    │   (build + sign txs) │
    └──────────┬───────────┘
             │
             │ 5. Submit to Starknet
             ▼
    ┌──────────────────────┐
    │  executeTransaction()│
    │  • Clean BigInts     │
    │  • Submit via RPC    │
    │  • Wait for confirm  │
    └──────────┬───────────┘
             │
             │ 6. Return result
             ▼
    ┌─────────────────┐
    │   ClaimResult   │
    │   { success,    │
    │     txHash,     │
    │     message }   │
    └─────────────────┘
```

### Claim Methods

#### 1. Automatic Claim

**When**: SDK supports `swap.claim()` method

```typescript
async performAutomaticClaim(swap: any, swapId: string): Promise<ClaimResult> {
  // Call SDK's automatic claim
  await swap.claim();

  // Wait for transaction confirmation
  await swap.waitTillClaimed();

  return {
    success: true,
    message: 'Swap claimed successfully via automatic claim'
  };
}
```

**Pros**: Simple, handles everything internally
**Cons**: Less control, can't customize gas/fees

#### 2. Manual Claim (with Starknet Signer)

**When**: User wants to sign transactions themselves

```typescript
async performManualClaim(
  swap: any,
  swapId: string,
  starknetSigner: any
): Promise<ClaimResult> {
  // 1. Get unsigned transactions
  const unsignedTxs = await swap.getUnsignedClaimTxs();

  // 2. Clean transactions (remove BigInts)
  const cleanedTxs = this.transactionCleaner.cleanTransactions(unsignedTxs);

  // 3. Sign with Starknet signer
  const signedTxs = await Promise.all(
    cleanedTxs.map(tx => starknetSigner.signTransaction(tx))
  );

  // 4. Submit to Starknet
  const txHash = await executeTransaction(signedTxs[0], this.config);

  return {
    success: true,
    txHash,
    message: 'Swap claimed successfully'
  };
}
```

**Note**: According to Atomiq docs, `getUnsignedClaimTxs()` may not be available for all swap types. The code currently returns an error message indicating this (`claim-orchestrator.ts:128-134`).

### Transaction Cleaning

**Location**: `src/lib/services/server/atomiq/claim/transaction-cleaner.ts`

**Problem**: Atomiq SDK returns transactions with BigInt values, which cannot be JSON-serialized.

**Solution**:
```typescript
class TransactionCleaner {
  cleanTransactions(transactions: any[]): any[] {
    return transactions.map(tx => this.cleanTransaction(tx));
  }

  private cleanTransaction(tx: any): any {
    // Recursively convert BigInt to string
    if (typeof tx === 'bigint') return tx.toString();
    if (Array.isArray(tx)) return tx.map(item => this.cleanTransaction(item));
    if (typeof tx === 'object' && tx !== null) {
      return Object.fromEntries(
        Object.entries(tx).map(([key, value]) => [
          key,
          this.cleanTransaction(value)
        ])
      );
    }
    return tx;
  }
}
```

---

## Error Handling

### Error Handler Architecture

**Location**: `src/lib/services/server/atomiq/error-handlers.ts`

```typescript
export function handleLightningSwapError(
  error: unknown,
  request: LightningSwapRequest
): never {
  // Extract error message
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log with context
  logger.error('Lightning swap creation failed', error as Error, {
    request: {
      amountSats: request.amountSats,
      destinationAsset: request.destinationAsset,
      starknetAddress: request.starknetAddress.substring(0, 10) + '...'
    }
  });

  // Throw user-friendly error
  throw new Error(`Failed to create Lightning swap: ${errorMessage}`);
}
```

### Common Error Scenarios

#### 1. SDK Not Initialized

**Error**: "Swapper not initialized - SDK state invalid"

**Cause**: SDK initialization failed or timed out

**Solution**:
```typescript
// Service automatically attempts re-initialization
await this.ensureSDKInitialized();
```

**Location**: `starknetToLightning.service.ts:183-210`

#### 2. Swap Creation Timeout

**Error**: "Swap creation timed out after 90 seconds"

**Cause**: SDK `swap()` call hanging

**Timeout**: 90 seconds (`starknetToLightning.service.ts:141`)

**Solution**:
- Check Starknet RPC connectivity
- Verify Atomiq intermediary URLs
- Retry the request

#### 3. Payment Timeout

**Error**: "Lightning payment was not received in time"

**Cause**: User didn't pay invoice within timeout period

**Timeout**: 5 minutes (300 seconds)

**Location**: `claim-orchestrator.ts:61`

**Solution**:
- User needs to pay invoice faster
- Consider increasing timeout in production

#### 4. Claim Transaction Failed

**Error**: "Failed to submit claim transaction"

**Causes**:
- Insufficient funds in claiming account
- Gas price too low
- Network congestion

**Solution**:
- Check deployer account balance
- Retry with higher gas price
- Wait for network congestion to clear

#### 5. Invalid Lightning Invoice

**Error**: "Invalid Lightning invoice format"

**Cause**: Malformed invoice string

**Validation**: Client-side validation should catch this

**Solution**:
- Verify invoice starts with "lnbc" (mainnet) or "lntb" (testnet)
- Check invoice is not expired

---

## Timeout & Retry Logic

### Timeout Configuration

| Operation | Timeout | Location |
|-----------|---------|----------|
| Swap Creation | 90s | `starknetToLightning.service.ts:141` |
| Payment Wait | 5min | `config.ts:19` |
| Claim Wait | 5min | `claim-orchestrator.ts` |
| Transaction Confirmation | 30s | `starknet-utils.ts` |

### Payment Waiting Loop

**Location**: `src/lib/services/server/atomiq/claim/claim-orchestrator.ts:228-285`

```typescript
private async waitForPayment(swap: any): Promise<boolean> {
  const startTime = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5 minutes
  const CHECK_INTERVAL = 5000;   // 5 seconds

  while (Date.now() - startTime < TIMEOUT) {
    const state = swap.getState();

    // State 1 = PR_PAID (payment received)
    if (state === 1) {
      return true;
    }

    // Negative states = failed/expired
    if (state < 0) {
      return false;
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }

  // Timeout reached
  return false;
}
```

**Optimization Opportunity**: This could be replaced with webhook-based notifications for instant payment detection.

### Retry Logic

Currently, **no automatic retries** are implemented. Each operation either succeeds or fails immediately.

**Recommendation**: Add exponential backoff for:
- SDK initialization failures
- RPC connection errors
- Transaction submission failures

**Example Implementation**:
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries reached');
}
```

---

## Real-Time Updates

### Server-Sent Events (SSE)

**Endpoint**: `GET /api/lightning/webhook`

**Location**: `src/routes/api/lightning/webhook/+server.ts`

```typescript
export async function GET({ url }: RequestEvent) {
  const swapId = url.searchParams.get('swapId');

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      controller.enqueue(encoder.encode('data: {"status":"connected"}\n\n'));

      // Poll swap status every 5 seconds
      const intervalId = setInterval(async () => {
        const status = swapMonitor.getSwapStatus(swapId);

        if (status) {
          const data = JSON.stringify(status);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));

          // Close stream on terminal state
          if (['completed', 'failed', 'expired'].includes(status.status)) {
            clearInterval(intervalId);
            controller.close();
          }
        }
      }, 5000);

      // Cleanup on close
      // ...
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

### SSE Event Format

```json
{
  "swapId": "swap_123",
  "status": "paid",
  "progress": 66,
  "timestamp": "2026-01-13T12:00:00.000Z"
}
```

### Progress Calculation

**Location**: `src/lib/services/server/atomiq/swap-monitor.service.ts:295-310`

```typescript
private calculateProgress(status: string): number {
  switch (status) {
    case 'pending': return 0;
    case 'waiting_payment': return 33;
    case 'paid': return 66;
    case 'confirming': return 85;
    case 'completed': return 100;
    case 'failed': return 0;
    case 'expired': return 0;
    default: return 0;
  }
}
```

### Client-Side Integration

```typescript
// Open SSE connection
const eventSource = new EventSource(
  `/api/lightning/webhook?swapId=${swapId}`
);

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);

  // Update UI with status
  updateSwapStatus(update.status, update.progress);

  // Close on completion
  if (update.status === 'completed') {
    eventSource.close();
  }
};

eventSource.onerror = () => {
  console.error('SSE connection error');
  eventSource.close();
};
```

---

## Common Issues & Troubleshooting

### Issue 1: Swap Creation Hangs

**Symptoms**:
- `/api/lightning/create-invoice` takes > 90 seconds
- Eventually times out

**Causes**:
1. Starknet RPC unresponsive
2. Atomiq intermediary URLs unreachable
3. SDK not initialized properly

**Diagnosis**:
```bash
# Check RPC connectivity
curl $STARKNET_RPC_URL -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"starknet_chainId","params":[],"id":1}'

# Check Atomiq intermediary
curl -I $ATOMIQ_INTERMEDIARY_URL
```

**Solutions**:
- Verify `STARKNET_RPC_URL` in environment
- Check `ATOMIQ_INTERMEDIARY_URLS` configuration
- Review logs for SDK initialization errors

### Issue 2: Payment Detected But Claim Fails

**Symptoms**:
- Status shows "paid"
- Claim endpoint returns error
- Funds not received in Starknet wallet

**Causes**:
1. Claim transaction insufficient gas
2. Starknet network congestion
3. Swap expired before claim

**Diagnosis**:
```typescript
// Check swap state
const swap = swapRegistry.getSwapInfo(swapId);
console.log('Swap state:', swap.getState());

// Check claim method availability
console.log('Has claim():', typeof swap.claim === 'function');
```

**Solutions**:
- Retry claim with higher gas limit
- Wait for network congestion to clear
- Check swap expiry timestamp

### Issue 3: SSE Connection Drops

**Symptoms**:
- Real-time updates stop
- Client doesn't receive status changes

**Causes**:
1. Network timeout (default: 60s)
2. Server restart
3. Browser closes tab

**Solutions**:
- Implement SSE reconnection logic
- Add heartbeat messages every 30s
- Store swap ID in localStorage for recovery

### Issue 4: Swap Shows "Expired" But WBTC Sent

**Symptoms**:
- Bitcoin swap shows "expired" status
- User has already sent WBTC to deposit address

**Cause**: Race condition between SDK state update and deposit confirmation

**Solution**: Already handled in `swap-monitor.service.ts:98-110`

```typescript
// Override expired status if deposit confirmed
if (swapDirection === 'starknet_to_bitcoin' &&
    depositInfo?.confirmedDeposit) {
  status = 'pending';
}
```

### Issue 5: Invoice Amount Mismatch

**Symptoms**:
- Starknet → Lightning swap fails
- "Amount doesn't match invoice" error

**Cause**: User provided invoice with different amount than requested

**Solution**:
- Parse invoice amount before creating swap
- Validate against user's expected amount
- Show clear error message

---

## Performance Metrics

### Typical Swap Times

| Swap Type | Creation | Payment | Claim | Total |
|-----------|----------|---------|-------|-------|
| Lightning → Starknet | 2-5s | Instant | 30-60s | 35-70s |
| Starknet → Lightning | 2-5s | 10-20s | Auto | 15-30s |
| Bitcoin → Starknet | 2-5s | 10-60min | 30-60s | 15-65min |
| Starknet → Bitcoin | 2-5s | 10-20s | 10-60min | 25-65min |

### Resource Usage

**In-Memory Swap Storage**:
- Average swap object: ~2KB
- 1000 active swaps: ~2MB
- Cleanup: Automatic on completion/expiry

**Database Usage**:
- User transactions stored permanently
- Swap metadata not persisted (ephemeral)

---

## Future Improvements

### 1. Persistent Swap Storage

**Problem**: Swaps lost on server restart

**Solution**: Store swap metadata in PostgreSQL

```sql
CREATE TABLE swaps (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

### 2. Webhook-Based Payment Detection

**Problem**: Polling `getState()` every 5 seconds is inefficient

**Solution**: Use Atomiq webhooks for instant notifications

```typescript
// POST /api/atomiq/webhook
export async function POST({ request }) {
  const event = await request.json();

  if (event.type === 'payment_received') {
    swapMonitor.markSwapAsPaid(event.swapId);
    // Broadcast via SSE
  }
}
```

### 3. Automatic Retry Logic

**Problem**: Transient failures require manual retry

**Solution**: Implement exponential backoff

### 4. Claim Queue

**Problem**: Multiple simultaneous claims can overwhelm the system

**Solution**: Queue-based claim processing

```typescript
class ClaimQueue {
  private queue: string[] = [];
  private processing = false;

  async addToQueue(swapId: string) {
    this.queue.push(swapId);
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const swapId = this.queue.shift();
      await this.processClaim(swapId);
    }

    this.processing = false;
  }
}
```

### 5. Analytics & Monitoring

**Add metrics for**:
- Swap success rate
- Average swap duration
- Failure reasons distribution
- Total volume processed

---

## Developer Quick Reference

### Creating a Swap

```typescript
// Lightning → Starknet
import { LightningToStarknetService } from '$lib/services/server/atomiq';

const service = new LightningToStarknetService(config, swapperFactory, swapper);
const result = await service.createLightningToStarknetSwap({
  amountSats: 10000,
  destinationAsset: 'WBTC',
  starknetAddress: '0x...'
});

console.log('Invoice:', result.invoice);
console.log('Swap ID:', result.swapId);
```

### Monitoring Status

```typescript
import { SwapMonitorService } from '$lib/services/server/atomiq';

const monitor = new SwapMonitorService(swapRegistry);
const status = monitor.getSwapStatus(swapId);

console.log('Status:', status.status);
console.log('Progress:', status.progress);
```

### Claiming a Swap

```typescript
import { SwapClaimerService } from '$lib/services/server/atomiq';

const claimer = new SwapClaimerService(config, swapRegistry);
const result = await claimer.claimLightningSwap(swapId);

if (result.success) {
  console.log('Tx Hash:', result.txHash);
}
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [SECURITY_MODEL.md](./SECURITY_MODEL.md) - Security considerations
- [README.md](../README.md) - Setup and deployment
- [Atomiq SDK Docs](https://docs.atomiq.com/) - Official SDK documentation

---

**For questions or issues with Atomiq swaps, check:**
1. Server logs for detailed error messages
2. Swap state via `/api/lightning/swap-status/[id]`
3. Starknet RPC connectivity
4. Atomiq SDK version compatibility
