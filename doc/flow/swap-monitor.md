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

It is a **pure orchestrator** — it calls `SwapService` methods and the
`AtomiqGateway` port. It contains no business logic: if you wanted to
replace it with a cron job, a message queue consumer, or an external
process, the domain layer wouldn't change.

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
│       │  SwapService     │        │  AtomiqGatewa         │          │
│       │  (domain)        │        │  (adapter)            │          │
│       └───────┬──────────┘        └────────────┬──────────┘          │
│               │                                │                     │
│       ┌───────┴──────────┐        ┌────────────┴──────────┐          │
│       │ BIM Backend      │        │  Atomiq SDK (external │          │
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
| `SwapService` | Domain (application) | `fetchStatus`, `getActiveSwaps`, `recordClaimAttempt`, `syncWithAtomiq` (private). |
| `AtomiqGateway` | Port | `getSwapStatus`, `claimForwardSwap`. |
| `Swap` entity | Domain | State machine + `hasRecentClaimAttempt()` cooldown helper. |
| `SwapRepository` | Port | Persistence (`save`, `findById`, `findActive`). Backed by Drizzle on PostgreSQL. |
| Atomiq SDK | External | Persists its own state via `PgUnifiedStorage` on the same PostgreSQL pool. |

### Future extraction

The monitor is deliberately loose-coupled to the API process. If load
grows, it can be extracted to its own process calling the
`SwapService` via internal HTTP endpoints. The service API is already
the internal contract — no refactor would be needed on the domain side.

---

## Lifecycle

The monitor is **not started at boot**. It's started on demand, the
first time a swap is created:

```ts
// apps/api/src/routes/payment/receive/receive.routes.ts
swapMonitor?.ensureRunning();
```

`ensureRunning()` is a no-op if the monitor is already running;
otherwise it starts the polling loop.

Once running, the monitor keeps ticking as long as there are active
(non-terminal) swaps. If an iteration finds **zero active swaps**, it
increments an idle counter; after `maxIdleIterations` consecutive idle
ticks (default 30, ~2.5 min at 5s poll), it auto-stops. The next
`ensureRunning()` call will start it again.

```
             ensureRunning()
                    │
                    ▼
              ┌──────────┐       every 5 s        ┌───────────────┐
              │  start() ├──────────────────────▶│ runIteration  │
              └──────────┘                        └───────┬───────┘
                                                          │
                                     ┌────────────────────┼───────────────────┐
                                     │                    │                   │
                                     ▼                    ▼                   ▼
                          ┌────────────────┐   ┌─────────────────┐   ┌─────────────────┐
                          │ activeSwaps = 0│   │ activeSwaps > 0 │   │ iteration error │
                          │ idle++         │   │ idle = 0        │   │ log, continue   │
                          │ if idle ≥ 30:  │   │ for each: sync  │   └─────────────────┘
                          │   stop()       │   │ + claim if      │
                          └────────────────┘   │   needed        │
                                               └─────────────────┘
```

The `start()` / `stop()` methods are idempotent. `stop()` waits for
the in-flight iteration (if any) to finish before clearing the timer
(`swap.monitor.ts:96-107`).

Why auto-stop on idle? The API runs on **Scaleway Serverless
Containers**, which scale to zero when there is no HTTP traffic. If
the monitor keeps polling forever, the container never scales down and
we pay for nothing. When there's no active swap there's nothing to
poll, so we can safely shut the loop and let the container sleep.

---

## The polling loop (`runIteration`)

Per iteration (`swap.monitor.ts:112-180`):

```
runIteration()
│
├── If an iteration is already in progress → return (re-entry guard)
│
├── activeSwaps = swapService.getActiveSwaps()
│     (SQL: SELECT * FROM swaps WHERE status NOT IN
│            ('completed', 'failed', 'refunded', 'lost')
│        AND NOT (status='expired' AND direction='bitcoin_to_starknet'))
│     — see Swap.isTerminal() for the Bitcoin carve-out.
│
├── If activeSwaps is empty:
│     ├── Clear knownActiveSwapIds
│     ├── idleIterations++
│     └── If idleIterations ≥ maxIdleIterations: stop() and return
│
├── Reset idleIterations to 0
│
├── Log newly-detected swaps (knownActiveSwapIds diff)
│
├── keepaliveIfNeeded(activeSwaps.length)
│     (see next section)
│
└── For each active swap (try/catch per swap — one failure doesn't
│   abort the whole iteration):
│   │
│   ├── { swap: synced, status } = swapService.fetchStatus({
│   │         swapId: swap.data.id,
│   │         accountId: swap.data.accountId
│   │       })
│   │
│   │   fetchStatus() internally calls syncWithAtomiq() (private on
│   │   SwapService) which in turn calls AtomiqGateway.getSwapStatus(),
│   │   maps the response to {isPaid/isClaimable/isCompleted/...} flags,
│   │   and transcribes the state onto the Swap entity (see swap.service.ts:567-610).
│   │
│   └── If status === 'claimable'
│       AND synced.isForward()             ← forward swaps only
│       AND canClaim(synced)               ← cooldown check
│       → claimSwap(swap.data.id)
```

> **Why only forward swaps are auto-claimed.** Reverse swaps
> (`starknet_to_lightning`, `starknet_to_bitcoin`) are **send**
> operations where the Atomiq LP handles claiming their own deposit.
> The monitor only tracks their status; there is nothing for BIM to
> claim.

---

## Keepalive

The API container can scale to zero between requests, but the monitor
runs inside that container. If there's no HTTP traffic from users for
a few minutes, Scaleway shuts the instance down — killing the monitor
mid-swap.

To prevent this, the monitor sends a self-ping to `/api/health/live`
every `keepaliveIntervalIterations` ticks (default: 60 → ~5 minutes at
a 5s poll) **while there is at least one active swap**:

```ts
// swap.monitor.ts:187-207
private async keepaliveIfNeeded(activeSwapCount: number): Promise<void> {
  this.iterationsSinceLastKeepalive++;
  if (this.iterationsSinceLastKeepalive < this.config.keepaliveIntervalIterations) return;
  this.iterationsSinceLastKeepalive = 0;
  const url = `${this.config.keepaliveUrl}/api/health/live`;
  await fetch(url, {signal: AbortSignal.timeout(5000)});
}
```

The `keepaliveUrl` is the container's public origin (`config.webauthn.origin`,
see `app.ts:108`). The ping goes through the public front door, which
resets Scaleway's idle timer. Keepalive failures are logged but
non-fatal — the monitor continues ticking.

Once the monitor auto-stops (no more active swaps), the container can
scale to zero normally.

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

The monitor logs this and then calls `swapService.recordClaimAttempt`
with the `claimTxHash`. The swap status stays `claimable` — the state
transition to `completed` happens on the next iteration when
`syncWithAtomiq()` sees the claim tx mined.

---

## Claim cooldown

`claimForwardSwap` is **not idempotent on the happy path**. If the
monitor re-submits a claim tx while a previous claim tx from the same
iteration is still pending (not yet mined), the second tx will revert
(nonce conflict) and waste gas.

The cooldown prevents this. Each time `claimSwap` runs, it calls:

```ts
// Swap.recordClaimAttempt sets two metadata fields:
// data.lastClaimAttemptAt = now
// data.lastClaimTxHash = txHash
await swapService.recordClaimAttempt(swapId, claimTxHash);
```

On the next iteration, `SwapMonitor.canClaim()` checks:

```ts
// swap.monitor.ts:214-223
private canClaim(swap: Swap): boolean {
  if (!swap.hasRecentClaimAttempt(this.config.claimCooldownMs)) {
    return true;
  }
  // skip, previous attempt still within cooldown
  return false;
}
```

`Swap.hasRecentClaimAttempt(withinMs)` simply compares
`Date.now() - lastClaimAttemptAt < withinMs`.

Default cooldown: **2 minutes** (`DEFAULT_CLAIM_COOLDOWN_MS = 2 * 60 * 1000`).
This is longer than the typical Starknet mining time, so in the happy
path the swap transitions `claimable → completed` well before the
cooldown expires and the next iteration simply skips the claim
entirely.

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

## Configuration

```ts
// apps/api/src/monitoring/swap.monitor.ts:9-30
export interface SwapMonitorConfig {
  pollInterval?: number;                 // ms between iterations (default 5000)
  maxIdleIterations?: number;            // idle ticks before auto-stop (default 30)
  keepaliveUrl: string;                  // public origin of this container (required)
  keepaliveIntervalIterations?: number;  // ticks between keepalive pings (default 60)
  claimCooldownMs?: number;              // anti-retry cooldown (default 120_000)
}
```

Wired up at startup in `apps/api/src/app.ts:102-110`:

```ts
swapMonitor = new SwapMonitor(
  context.services.swap,
  context.gateways.atomiq,
  context.logger,
  {keepaliveUrl: config.webauthn.origin},
);
```

The monitor is then passed into the receive routes
(`createPaymentRoutes(context, swapMonitor)`) so they can call
`ensureRunning()` after a swap is created.

---

## Error handling

| Level | Behavior |
|-------|----------|
| Single swap sync failure | Logged as `warn`. The `for` loop catches the error per swap and continues with the next one (`swap.monitor.ts:164-170`). `syncWithAtomiq` has its own try/catch and preserves the swap's current state on transient Atomiq errors (`swap.service.ts:604-609`). |
| Single claim failure | Logged as `error`. No retry counter — the cooldown will gate the next attempt. If the cooldown expires and the swap is still `claimable`, the monitor retries naturally. |
| `claimForwardSwap` returns `claimedByBackend: false` | Logged as `warn` (watchtower won the race). No bounty refund is executed. Diagnostic called to log why our backend lost. |
| Entire iteration throws | Logged as `error` at the top-level try/catch (`swap.monitor.ts:172-176`). The `iterating` flag is cleared in the `finally`. Next tick proceeds normally. |
| Keepalive ping fails | Logged as `warn`. Does not affect the polling loop. |
| Swap not found in SDK storage | `getSwapStatus()` returns `{state: -2, error: 'Swap X not found in SDK storage'}`. `syncWithAtomiq` transitions the swap to `lost` (terminal). Monitor stops polling it. |

**All errors are non-fatal at the iteration level.** The monitor never
crashes the API process; the worst case is a logged warning and the
same swap getting retried on the next tick.

---

## Frontend status updates (polling, not SSE)

There is **no SSE endpoint** today. The frontend polls
`GET /api/swap/status/:swapId` every few seconds. That endpoint calls
`SwapService.fetchStatus`, which in turn syncs with Atomiq on demand —
so the polling is always up-to-date even if the monitor hasn't run
yet. The monitor is just an optimisation so the claim happens as soon
as possible without waiting for the user to poll.

> **Internal vs public status.** `GET /api/swap/status/:swapId` maps
> the internal `claimable` state to `paid` for the frontend (see
> `swap.routes.ts:58-59`). The claimable/paid distinction is only
> meaningful for the monitor's claim timing — the user doesn't care
> whether the claim tx has been submitted yet.

### Future work

An SSE endpoint (`GET /api/swap/events/:swapId`) was in the original
design but never implemented. It would let the frontend push-subscribe
to state changes instead of polling. If implemented, it should:
- Use `streamSSE` from `hono/streaming`.
- Read from the repository, **not** from Atomiq — the monitor keeps
  the repository up to date and SSE should not trigger extra Atomiq
  calls per connected client.
- Close the connection on terminal state.

---

## Key file references

- Monitor class: `apps/api/src/monitoring/swap.monitor.ts`
- Registration: `apps/api/src/app.ts:102-110`
- `ensureRunning()` calls: `apps/api/src/routes/payment/receive/receive.routes.ts:173, 244`
- `SwapService.getActiveSwaps`: `packages/domain/src/swap/swap.service.ts:522-524`
- `SwapService.fetchStatus`: `packages/domain/src/swap/swap.service.ts:440-467`
- `SwapService.recordClaimAttempt`: `packages/domain/src/swap/swap.service.ts:503-512`
- `SwapService.syncWithAtomiq` (private): `packages/domain/src/swap/swap.service.ts:567-610`
- `Swap.isTerminal` / `isForward`: `packages/domain/src/swap/swap.ts:163-184`
- `Swap.recordClaimAttempt` / `hasRecentClaimAttempt`: `packages/domain/src/swap/swap.ts:254-276`
- `AtomiqGateway.claimForwardSwap` port: `packages/domain/src/ports/gateways.ts:242-260`
- `AtomiqSdkGateway.claimForwardSwap` adapter: `packages/atomiq/src/atomiq.gateway.ts:749-808`
- `isClaimTxFromBackend` watchtower detection: `packages/atomiq/src/atomiq.gateway.ts:816-835`
