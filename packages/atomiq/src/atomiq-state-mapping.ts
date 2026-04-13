import type {SwapDirection} from '@bim/domain/swap';

/**
 * Flags summarising an Atomiq swap's current state.
 *
 * Shape consumed by SwapService.syncWithAtomiq: at most one of the
 * "terminal" flags (isCompleted, isFailed, isExpired, isRefunded) should
 * be true at any given time. All flags false means "still pending".
 */
export interface AtomiqSwapStatusFlags {
  readonly isPaid: boolean;
  readonly isClaimable: boolean;
  readonly isCompleted: boolean;
  readonly isFailed: boolean;
  readonly isExpired: boolean;
  readonly isRefunded: boolean;
  readonly isRefundable: boolean;
}

const NEUTRAL: AtomiqSwapStatusFlags = {
  isPaid: false,
  isClaimable: false,
  isCompleted: false,
  isFailed: false,
  isExpired: false,
  isRefunded: false,
  isRefundable: false,
};

/**
 * Maps the raw numeric state returned by the Atomiq SDK to BIM's
 * high-level status flags. Each swap family has its OWN state enum, with
 * different negative-value semantics, so the mapping is direction-aware.
 *
 * SDK enums verified against @atomiqlabs/sdk@8.4.4:
 *
 *   lightning_to_starknet  (FromBTCLNSwap AND FromBTCLNAutoSwap — identical):
 *     -4 FAILED              | -3 QUOTE_EXPIRED        | -2 QUOTE_SOFT_EXPIRED
 *     -1 EXPIRED (HTLC dead on destination, claim no longer safe)
 *      0 PR_CREATED          |  1 PR_PAID              |  2 CLAIM_COMMITED
 *      3 CLAIM_CLAIMED
 *
 *   bitcoin_to_starknet    (legacy FromBTCSwap — still used by BIM):
 *     -4 FAILED              | -3 EXPIRED (addr expired, LP not yet refunded)
 *     -2 QUOTE_EXPIRED       | -1 QUOTE_SOFT_EXPIRED
 *      0 PR_CREATED          |  1 CLAIM_COMMITED (Starknet escrow)
 *      2 BTC_TX_CONFIRMED    |  3 CLAIM_CLAIMED
 *
 *   starknet_to_lightning / starknet_to_bitcoin (ToBTCLNSwap / ToBTCSwap):
 *     -3 REFUNDED            | -2 QUOTE_EXPIRED        | -1 QUOTE_SOFT_EXPIRED
 *      0 CREATED             |  1 COMMITED             |  2 SOFT_CLAIMED
 *      3 CLAIMED             |  4 REFUNDABLE (ToBTC only)
 *
 * Semantics:
 * - isPaid means "payment detected". For bitcoin_to_starknet this requires
 *   state >= 2 (BTC tx confirmed), NOT state >= 1 (Starknet commit), because
 *   the escrow commit happens before any actual BTC deposit.
 * - isClaimable means "the backend can submit a claim tx". Only forward
 *   swaps are claimable by BIM; reverse swaps are claimed by the LP itself.
 */
export function mapAtomiqStateToStatus(
  state: number,
  direction?: SwapDirection,
): AtomiqSwapStatusFlags {
  if (state < 0) {
    return mapNegativeState(state, direction);
  }
  return mapNonNegativeState(state, direction);
}

function mapNegativeState(
  state: number,
  direction: SwapDirection | undefined,
): AtomiqSwapStatusFlags {
  switch (direction) {
    case 'lightning_to_starknet':
      return mapLightningToStarknetNegative(state);
    case 'bitcoin_to_starknet':
      return mapBitcoinToStarknetNegative(state);
    case 'starknet_to_lightning':
    case 'starknet_to_bitcoin':
      return mapReverseNegative(state);
    default:
      // Conservative fallback when the direction is unknown.
      return {...NEUTRAL, isFailed: state <= -3, isExpired: state > -3};
  }
}

// -1 HTLC EXPIRED: destination HTLC past its safe-claim window —
//    the LP will refund the payer, BIM cannot recover the swap.
// -2 QUOTE_SOFT_EXPIRED: LP authorization expired but the swap
//    may still be revived via SDK _sync().
// -3 QUOTE_EXPIRED: definitive quote expiration.
// -4 FAILED: user never settled the HTLC on the destination.
function mapLightningToStarknetNegative(state: number): AtomiqSwapStatusFlags {
  if (state === -2) return NEUTRAL;
  if (state === -3) return {...NEUTRAL, isExpired: true};
  return {...NEUTRAL, isFailed: true};
}

// -1 QUOTE_SOFT_EXPIRED: still recoverable.
// -2 QUOTE_EXPIRED: definitive.
// -3 EXPIRED: BTC swap address expired but LP has not yet
//    refunded; an in-flight BTC tx may still land. Surface as
//    "expired" — Swap.isTerminal() keeps bitcoin_to_starknet in
//    the active set on expired so the monitor keeps polling.
// -4 FAILED: expired AND the LP already refunded its own funds.
function mapBitcoinToStarknetNegative(state: number): AtomiqSwapStatusFlags {
  if (state === -1) return NEUTRAL;
  if (state === -2 || state === -3) return {...NEUTRAL, isExpired: true};
  return {...NEUTRAL, isFailed: true};
}

// -1 QUOTE_SOFT_EXPIRED: BIM submits the commit externally via
//    the AVNU paymaster, so the SDK lags until _sync() detects
//    the on-chain commit. Stay neutral to avoid premature expiry.
// -2 QUOTE_EXPIRED: definitive.
// -3 REFUNDED: LP refunded the escrow on the source chain.
function mapReverseNegative(state: number): AtomiqSwapStatusFlags {
  if (state === -1) return NEUTRAL;
  if (state === -2) return {...NEUTRAL, isExpired: true};
  if (state === -3) return {...NEUTRAL, isRefunded: true};
  return {...NEUTRAL, isFailed: true};
}

function mapNonNegativeState(
  state: number,
  direction: SwapDirection | undefined,
): AtomiqSwapStatusFlags {
  const isForward =
    direction === 'lightning_to_starknet' || direction === 'bitcoin_to_starknet';
  const isReverse =
    direction === 'starknet_to_lightning' || direction === 'starknet_to_bitcoin';

  // State 4 (REFUNDABLE) only exists for reverse swaps — the LP failed
  // to process the swap, and the escrow is refundable on the source chain.
  if (state === 4 && isReverse) {
    return {...NEUTRAL, isRefundable: true};
  }

  // For bitcoin_to_starknet the Starknet commit (state 1) precedes the
  // actual BTC deposit — only treat the swap as "paid" once BTC lands.
  const paidThreshold = direction === 'bitcoin_to_starknet' ? 2 : 1;
  const claimableThreshold = 2;

  return {
    isPaid: state >= paidThreshold,
    isClaimable: isForward && state >= claimableThreshold,
    isCompleted: state === 3,
    isFailed: false,
    isExpired: false,
    isRefunded: false,
    isRefundable: false,
  };
}
