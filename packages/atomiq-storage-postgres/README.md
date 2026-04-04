# @bim/atomiq-storage-postgres

PostgreSQL storage backend for the [Atomiq SDK](https://github.com/niceatomiqlabs/). Drop-in replacement for the default SQLite storage (`@atomiqlabs/storage-sqlite`), ensuring swap data survives container restarts and redeployments.

## Why this package exists

The Atomiq SDK stores all swap state internally (quotes, escrow status, claim data). By default it uses SQLite, which is lost when a container is restarted (because not in a persisted volume). This package provides two PostgreSQL-backed implementations that plug into the SDK's storage interfaces, so swap data is persisted in the same PostgreSQL instance used by the rest of the BIM application. That also makes it easier to technically monitor atomic swaps.

## Classes

### `PgUnifiedStorage`

Implements `IUnifiedStorage` from `@atomiqlabs/sdk`. Stores swap objects in a single table with indexed columns for efficient querying by type, state, initiator, etc.

- **Default table:** `atomiq_swaps`
- **Schema:** dynamically created from the SDK's index definitions at `init()` time
- **Key columns:** `id` (PK), indexed columns (type, state, initiator...), `data` (full JSON blob)

### `PgStorageManager`

Implements `IStorageManager` from `@atomiqlabs/base`. Simple key-value store for chain-level data (watchtower state, intermediary cache, etc.).

- **Default table:** `atomiq_store`
- **Schema:** `id` (PK), `value` (JSON text)

---

## SwapType enum (`type` column)

Source: `@atomiqlabs/sdk` — `SwapType`

| Value | Name | Description | Used in BIM |
|-------|------|-------------|-------------|
| 0 | `FROM_BTC` | Legacy escrow (PrTLC) **Bitcoin on-chain → Smart chain**. User must manually commit on the destination chain, then send BTC to the swap address. After BTC confirmation, watchtowers or the user settle the escrow. Legacy protocol, originally designed for Solana. | **Yes** — `createFromBTCSwap()` for `bitcoin_to_starknet` receive flows |
| 1 | `FROM_BTCLN` | Legacy escrow (HTLC) **Lightning → Smart chain**. User pays a Lightning invoice, then must manually commit and claim the HTLC escrow on the destination chain. Legacy protocol, originally designed for Solana. | **Yes** — `createFromBTCLNSwapNew()` for `lightning_to_starknet` receive flows |
| 2 | `TO_BTC` | Escrow (PrTLC) **Smart chain → Bitcoin on-chain**. User commits an escrow on the source chain, the intermediary (LP) sends BTC on-chain. Once the LP proves the BTC payment, the escrow is settled. If the LP fails, the escrow becomes refundable. | **Yes** — `createToBTCSwap()` for `starknet_to_bitcoin` pay flows |
| 3 | `TO_BTCLN` | Escrow (HTLC) **Smart chain → Lightning**. User commits an HTLC escrow on the source chain, the LP pays the Lightning invoice. The payment preimage settles the escrow. If the LP fails, the escrow becomes refundable. | **Yes** — `createToBTCLNSwap()` for `starknet_to_lightning` pay flows |
| 4 | `TRUSTED_FROM_BTC` | Trusted (non-escrow) **Bitcoin → Smart chain** for small gas-token amounts. No escrow — relies on trust with the LP. Solana only. | No |
| 5 | `TRUSTED_FROM_BTCLN` | Trusted (non-escrow) **Lightning → Smart chain** for small gas-token amounts. No escrow — relies on trust with the LP. Solana only. | No |
| 6 | `SPV_VAULT_FROM_BTC` | SPV vault (UTXO-controlled) **Bitcoin → Smart chain**. No initiation needed on the destination chain. User sends BTC to a vault address co-signed by the LP. After confirmation, the smart contract verifies the BTC transaction via SPV proof. Non-Solana chains only. | No (could replace type 0 in future) |
| 7 | `FROM_BTCLN_AUTO` | Auto escrow (HTLC) **Lightning → Smart chain**. The LP initiates the escrow on the destination chain (not the user). A permissionless watchtower network handles claiming via Nostr-broadcasted secrets. Non-Solana chains only. | No (could replace type 1 in future) |

## SwapDirection enum

Source: `@atomiqlabs/sdk` — `SwapDirection`

| Value | Name | Description |
|-------|------|-------------|
| 0 | `FROM_BTC` | Bitcoin → Smart chain (covers types 0, 1, 4, 5, 6, 7) |
| 1 | `TO_BTC` | Smart chain → Bitcoin (covers types 2, 3) |

---

## State enums (`state` column)

The `state` column meaning depends on the `type` column. Negative values indicate error/expiration states.

### Types 0 — `FromBTCSwapState` (Legacy Bitcoin → Smart chain)

| Value | Name | Description |
|------:|------|-------------|
| -4 | `FAILED` | Swap address expired and LP refunded its funds. Terminal. |
| -3 | `EXPIRED` | Swap address expired. LP hasn't refunded yet — in-flight BTC tx might still succeed. |
| -2 | `QUOTE_EXPIRED` | Quote expired permanently. No recovery possible. |
| -1 | `QUOTE_SOFT_EXPIRED` | Quote almost expired. Shown as expired to user, but may still be processed. |
| 0 | `PR_CREATED` | Quote created. Waiting for user to commit escrow on destination chain. |
| 1 | `CLAIM_COMMITED` | Escrow committed on destination chain. User can now send BTC to swap address. |
| 2 | `BTC_TX_CONFIRMED` | Input BTC transaction confirmed. Waiting for settlement (watchtower or manual claim). |
| 3 | `CLAIM_CLAIMED` | Swap settled. Funds received on destination chain. Terminal success. |

### Type 1 — `FromBTCLNSwapState` (Legacy Lightning → Smart chain)

| Value | Name | Description |
|------:|------|-------------|
| -4 | `FAILED` | User didn't settle HTLC before expiration. Terminal. |
| -3 | `QUOTE_EXPIRED` | Quote expired permanently. |
| -2 | `QUOTE_SOFT_EXPIRED` | Quote almost expired. May still be processed. |
| -1 | `EXPIRED` | HTLC on destination chain expired. Unsafe to claim. |
| 0 | `PR_CREATED` | Lightning invoice created. Waiting for payment. |
| 1 | `PR_PAID` | Lightning payment received by LP. User must now commit+claim HTLC on destination chain. |
| 2 | `CLAIM_COMMITED` | HTLC escrow created on destination chain. Ready for claim. |
| 3 | `CLAIM_CLAIMED` | Swap settled. Funds received. Terminal success. |

### Types 2 & 3 — `ToBTCSwapState` (Smart chain → Bitcoin / Lightning)

| Value | Name | Description |
|------:|------|-------------|
| -3 | `REFUNDED` | LP couldn't process the swap. Funds refunded on source chain. Terminal. |
| -2 | `QUOTE_EXPIRED` | Quote expired permanently. |
| -1 | `QUOTE_SOFT_EXPIRED` | Quote almost expired. May still be processed. |
| 0 | `CREATED` | Swap created. Waiting for user to commit escrow on source chain. |
| 1 | `COMMITED` | Escrow committed on source chain. LP is processing the payment. |
| 2 | `SOFT_CLAIMED` | LP sent funds on destination (BTC/LN) but hasn't settled escrow on source chain yet. |
| 3 | `CLAIMED` | Escrow settled on source chain. Terminal success. |
| 4 | `REFUNDABLE` | LP failed to process. Escrow is refundable by the user. |

### Type 6 — `SpvFromBTCSwapState` (SPV vault Bitcoin → Smart chain)

| Value | Name | Description |
|------:|------|-------------|
| -5 | `CLOSED` | Catastrophic failure in smart contract processing. Terminal. |
| -4 | `FAILED` | BTC inputs double-spent. No BTC was sent. Terminal. |
| -3 | `DECLINED` | LP declined to co-sign the PSBT. Terminal. |
| -2 | `QUOTE_EXPIRED` | Quote expired permanently. |
| -1 | `QUOTE_SOFT_EXPIRED` | Quote almost expired. May still be processed. |
| 0 | `CREATED` | Swap created. Waiting for user to sign PSBT. |
| 1 | `SIGNED` | User signed the PSBT locally. |
| 2 | `POSTED` | PSBT sent to LP for co-signing and broadcast. |
| 3 | `BROADCASTED` | LP co-signed and broadcasted the BTC transaction. Waiting for confirmation. |
| 4 | `FRONTED` | Settlement fronted on destination chain. Funds received before final confirmation. |
| 5 | `BTC_TX_CONFIRMED` | BTC transaction confirmed. Waiting for smart contract settlement. |
| 6 | `CLAIMED` | Swap settled on smart chain. Terminal success. |

### Type 7 — `FromBTCLNAutoSwapState` (Auto Lightning → Smart chain)

| Value | Name | Description |
|------:|------|-------------|
| -4 | `FAILED` | User didn't settle HTLC before expiration. Terminal. |
| -3 | `QUOTE_EXPIRED` | Quote expired permanently. |
| -2 | `QUOTE_SOFT_EXPIRED` | Quote almost expired. May still be processed. |
| -1 | `EXPIRED` | HTLC on destination chain expired. Unsafe to claim. |
| 0 | `PR_CREATED` | Lightning invoice created. Waiting for payment. |
| 1 | `PR_PAID` | Lightning payment received by LP. Waiting for LP to create HTLC escrow on destination chain. |
| 2 | `CLAIM_COMMITED` | HTLC escrow created on destination chain (by LP). Watchtowers handle claiming. |
| 3 | `CLAIM_CLAIMED` | Swap settled. Funds received. Terminal success. |

### Types 4 & 5 — Trusted swaps (not used in BIM)

Simplified state machine with only `PR_CREATED` (0) and `PR_PAID` (1). No escrow involved.

---

## Usage

```typescript
import { PgUnifiedStorage, PgStorageManager } from '@bim/atomiq-storage-postgres';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Pass to Atomiq SDK factory
const unifiedStorage = new PgUnifiedStorage(pool, 'atomiq_swaps');
const storageManager = new PgStorageManager(pool, 'atomiq_store');
```

Both classes call `init()` automatically when the SDK initializes. `PgUnifiedStorage.init()` creates the table and indexes based on the SDK's index definitions. `PgStorageManager.init()` creates a simple key-value table.
