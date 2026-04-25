# Swap Monitor — Background Polling, Auto-Claim & Bounty Refund

> **Scope.** This doc describes the `SwapMonitor` — the background
> component that polls active swaps, auto-claims forward swaps when
> they become ready, and refunds the claimer bounty to the user.
>
> Related: [receive-lightning.md](./receive-lightning.md),
> [receive-bitcoin.md](./receive-bitcoin.md),
> [swap-commit.md](./receive-bitcoin-swap-commit.md).

## Purpose

The `SwapMonitor` does three things on a periodic tick (default: 5s):

1. **Sync active swaps** with the Atomiq SDK, transcribing the SDK's
   state into the local `Swap` entity and PostgreSQL.
2. **Auto-claim forward swaps** (`lightning_to_starknet`,
   `bitcoin_to_starknet`) once Atomiq reports them as `claimable`.
   The backend submits the claim tx first so it can collect the
   **claimer bounty** (STRK), which it then refunds to the user.
3. **Keepalive** the serverless container while swaps are active, to
   prevent Scaleway from scaling the instance down while funds are
   in-flight.

It is a **pure orchestrator** — it calls `SwapReader` / `SwapCoordinator`
methods and the `AtomiqGateway` port. It contains no business logic: if
you wanted to replace it with a cron job, a message queue consumer, or
an external process, the domain layer wouldn't change.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                 BIM Backend (apps/api process)                       │
│                                                                      │
│                 ┌──────────────────────┐                             │
│                 │ BIM Backend          │                             │
│                 │   SwapMonitor        │ (apps/api/src/monitoring/)  │
│                 └──────────┬───────────┘                             │
│                 ┌──────────┴─────────────────┐                       │
│                 │                            │                       │
│                 ▼                            ▼                       │
│       ┌──────────────────┐        ┌───────────────────────┐          │
│       │ BIM Backend      │        │ BIM Backend           │          │
│       │  SwapReader +    │        │  AtomiqGateway        │          │
│       │  SwapCoordinator │        │  (adapter)            │          │
│       │  (domain)        │        │                       │          │
│       └───────┬──────────┘        └────────────┬──────────┘          │
│               │                                │                     │
│       ┌───────┴──────────┐        ┌────────────┴──────────┐          │
│       │ BIM Backend      │        │  Atomiq SDK           │          │
│       │  SwapRepository  │        │  (external lib, SDK   │          │
│       │  (Drizzle)       │        │  storage on Postgres) │          │
│       └───────┬──────────┘        └────────────┬──────────┘          │
│               │                                │                     │
└───────────────┼────────────────────────────────┼─────────────────────┘
                │                                │
                ▼                                ▼
        ┌────────────────────┐           ┌───────────────────────┐
        │  BIM PostgreSQL    │           │  External networks    │
        │  (owned)           │           │  • Starknet L2        │
        │  • swaps table     │           │  • Lightning Network  │
        │  • atomiq_swaps    │           │  • Bitcoin L1         │
        └────────────────────┘           └───────────────────────┘
```

### Separation of concerns

| Component | Layer | Responsibility |
|-----------|-------|----------------|
| `SwapMonitor` | Infrastructure | Scheduling, cooldowns, keepalive. No business logic. |
| `SwapReader` | Domain (application) | `fetchLimits`, `fetchStatus` (UseCase impls). `syncWithAtomiq` (private). |
| `SwapCoordinator` | Domain (internal) | `getActiveSwaps`, `recordClaimAttempt`, plus swap creation/commit operations. |
| `AtomiqGateway` | Port | `getSwapStatus`, `claimForwardSwap`. |
| `Swap` entity | Domain | State machine + `hasRecentClaimAttempt()` cooldown helper. |
| `SwapRepository` | Port | Persistence (`save`, `findById`, `findActive`). Backed by Drizzle on PostgreSQL. |
| Atomiq SDK | External | Persists its own state via `PgUnifiedStorage` on the same PostgreSQL pool. |

---

## Lifecycle

The monitor is started at boot (`main.ts:24-27`), so swaps already in
the DB after a redeploy or crash keep being polled even before any new
HTTP traffic. Routes also call `swapMonitor?.ensureRunning()` after
creating a swap — belt-and-suspenders, in case the monitor auto-stopped
on idle.

Each tick (default 5 s), the monitor loads active swaps
(`SwapCoordinator.getActiveSwaps`), syncs each with Atomiq
(`SwapReader.fetchStatus`), and submits the claim tx for forward swaps
that just became `claimable` (see
[Claiming and bounty refund](#claiming-and-bounty-refund)).

If a tick finds zero active swaps for ~2.5 min, the monitor auto-stops
so the Scaleway serverless container can scale to zero. The next
`ensureRunning()` call restarts it. While swaps are in-flight, the
monitor self-pings `/api/health/live` every ~5 min to defeat Scaleway's
idle scale-to-zero.

Errors at the iteration level are non-fatal: a single swap failure is
logged and the loop continues with the next one. The monitor never
crashes the API process.

> **Why only forward swaps are auto-claimed.** Reverse swaps
> (`starknet_to_lightning`, `starknet_to_bitcoin`) are **send**
> operations where the Atomiq LP handles claiming their own deposit.
> The monitor only tracks their status; there is nothing for BIM to
> claim.

---

## Claiming and bounty refund

The most intricate part of the flow is `claimForwardSwap` in the
Atomiq adapter (`atomiq.gateway.ts:749-808`). It does three things:

### 1. Submit the claim transaction

```ts
claimTxHash = await swap.claim(
  this.claimerAccount,
  undefined,
  (txHash) => { submittedTxHash = txHash; /* log */ }
);
```

The SDK signs and broadcasts a Starknet transaction that:
- Releases the WBTC from the escrow contract to the **user's Starknet
  address**.
- Transfers the **claimer bounty** (STRK, the security deposit the
  user put up in phase 1 of the Bitcoin flow, or that Atomiq attached
  automatically for Lightning) to whoever submitted the claim tx —
  i.e., the backend's claimer account.

### 2. Verify the claim was actually submitted by the backend

Atomiq LPs also run **watchtowers** that race to claim forward swaps.
The first claim tx to land on-chain wins the bounty; the others
revert. The SDK's `claim()` method has a built-in fallback: if the
backend's tx fails but the watchtower has already claimed, it silently
returns the watchtower's tx hash instead of throwing.

That's a problem: we can't just trust the returned tx hash as "our"
tx. We have to verify the on-chain sender:

```ts
// atomiq.gateway.ts:816-835
private async isClaimTxFromBackend(claimTxHash: string): Promise<boolean> {
  const tx = await this.claimerAccount.getTransaction(claimTxHash);
  const senderAddress = tx.sender_address;
  return normalizedSender === normalizedBackend;
}
```

If the sender is **not** the backend's claimer account, we set
`claimedByBackend: false`, skip the bounty refund (there's nothing to
refund — the watchtower got it), and run a diagnostic
(`diagnoseClaimFailure`) to log why our claim probably lost the race.

### 3. Refund the bounty to the user

If we did win the race, the backend has just received STRK that morally
belongs to the user (they put it up as a security deposit for Bitcoin
swaps, or Atomiq forwarded it from the swap fee for Lightning). The
adapter then sends a second Starknet transaction to refund it:

```ts
// atomiq.gateway.ts:806
const refundTxHash = await this.refundBounty(swapId, userAddress, bountyAmount);
```

The refund tx is a plain STRK transfer from the backend claimer
account to the user's Starknet address. The refund tx hash is
persisted alongside the claim tx hash and surfaced in the log line.

### Return value

```ts
interface ForwardSwapClaimResult {
  claimTxHash: string;
  claimedByBackend: boolean;    // false if watchtower won
  refundTxHash: string | undefined; // undefined when claimedByBackend=false
  bountyAmount: bigint;         // 0n when claimedByBackend=false
  userAddress: string;
}
```

The monitor logs this and then calls `swapCoordinator.recordClaimAttempt`
with the `claimTxHash`. The swap status stays `claimable` — the state
transition to `completed` happens on the next iteration when
`syncWithAtomiq()` sees the claim tx mined.

---

## Claim cooldown

`claimForwardSwap` is **not idempotent on the happy path**. If the
monitor re-submits a claim tx while a previous claim tx from the same
iteration is still pending (not yet mined), the second tx will revert
(nonce conflict) and waste gas.

The cooldown prevents this. After every claim attempt, the monitor
calls `swapCoordinator.recordClaimAttempt(swapId, claimTxHash)`, which
stamps `lastClaimAttemptAt` and `lastClaimTxHash` on the swap. On the
next iteration, the monitor consults `Swap.hasRecentClaimAttempt(cooldownMs)`
before retrying — if the previous attempt is still within the cooldown,
the swap is skipped.

Default cooldown: **2 minutes**. This is longer than the typical
Starknet mining time, so in the happy path the swap transitions
`claimable → completed` well before the cooldown expires and the next
iteration simply skips the claim entirely.

If the cooldown expires and Atomiq still reports the swap as
`claimable`, the monitor assumes the previous claim tx was dropped
(mempool eviction, nonce conflict, …) and tries again. This is the
only retry mechanism — there is no counter, no max retries, no
exponential backoff.

**`lastClaimAttemptAt` and `lastClaimTxHash` are orthogonal to the
state machine.** They are persisted to the DB but never alter the
swap's `SwapStatus`. Atomiq remains the single source of truth for
state transitions.

---

## Error handling

| Level | Behavior |
|-------|----------|
| Single swap sync / claim failure | Logged. The iteration continues with the next swap; the cooldown gates any natural retry. |
| `claimForwardSwap` returns `claimedByBackend: false` | Watchtower won the race. No bounty refund executed; a diagnostic logs why our backend lost. |
| Swap not found in SDK storage | `getSwapStatus()` returns `state: -2`. `syncWithAtomiq` transitions the swap to `lost` (terminal) and the monitor stops polling it. |

All errors are non-fatal at the iteration level — the monitor never
crashes the API process; worst case is a logged warning and the same
swap getting retried on the next tick.

---

## Frontend status updates (polling, not SSE)

There is **no SSE endpoint** today. The frontend polls
`GET /api/swap/status/:swapId` every few seconds. That endpoint calls
`SwapReader.fetchStatus`, which in turn syncs with Atomiq on demand —
so the polling is always up-to-date even if the monitor hasn't run
yet. The monitor is just an optimisation so the claim happens as soon
as possible without waiting for the user to poll.

> **Internal vs public status.** `GET /api/swap/status/:swapId` maps
> the internal `claimable` state to `paid` for the frontend (see
> `swap.routes.ts:58-59`). The claimable/paid distinction is only
> meaningful for the monitor's claim timing — the user doesn't care
> whether the claim tx has been submitted yet.
