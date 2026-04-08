import {describe, expect, it} from 'vitest';
import type {AtomiqSwapStatusFlags} from '@bim/atomiq';
import {mapAtomiqStateToStatus} from '@bim/atomiq';
import type {SwapDirection} from '@bim/domain/swap';

const NEUTRAL: AtomiqSwapStatusFlags = {
  isPaid: false,
  isClaimable: false,
  isCompleted: false,
  isFailed: false,
  isExpired: false,
  isRefunded: false,
  isRefundable: false,
};

function expected(overrides: Partial<AtomiqSwapStatusFlags>): AtomiqSwapStatusFlags {
  return {...NEUTRAL, ...overrides};
}

interface Row {
  readonly direction: SwapDirection;
  readonly state: number;
  readonly label: string;
  readonly expected: AtomiqSwapStatusFlags;
}

// ---------------------------------------------------------------------------
// Negative states — each family has its own enum, verified against
// @atomiqlabs/sdk@8.4.4 source.
// ---------------------------------------------------------------------------
const NEGATIVE_CASES: readonly Row[] = [
  // lightning_to_starknet: FromBTCLNAutoSwapState (and legacy FromBTCLNSwapState)
  //   -4 FAILED | -3 QUOTE_EXPIRED | -2 QUOTE_SOFT_EXPIRED | -1 EXPIRED (HTLC dead)
  {direction: 'lightning_to_starknet', state: -4, label: 'FAILED',             expected: expected({isFailed: true})},
  {direction: 'lightning_to_starknet', state: -3, label: 'QUOTE_EXPIRED',      expected: expected({isExpired: true})},
  {direction: 'lightning_to_starknet', state: -2, label: 'QUOTE_SOFT_EXPIRED', expected: NEUTRAL},
  {direction: 'lightning_to_starknet', state: -1, label: 'HTLC EXPIRED',       expected: expected({isFailed: true})},

  // bitcoin_to_starknet: FromBTCSwapState (legacy, still used by BIM)
  //   -4 FAILED | -3 EXPIRED (addr) | -2 QUOTE_EXPIRED | -1 QUOTE_SOFT_EXPIRED
  {direction: 'bitcoin_to_starknet', state: -4, label: 'FAILED',             expected: expected({isFailed: true})},
  {direction: 'bitcoin_to_starknet', state: -3, label: 'EXPIRED (addr)',     expected: expected({isExpired: true})},
  {direction: 'bitcoin_to_starknet', state: -2, label: 'QUOTE_EXPIRED',      expected: expected({isExpired: true})},
  {direction: 'bitcoin_to_starknet', state: -1, label: 'QUOTE_SOFT_EXPIRED', expected: NEUTRAL},

  // starknet_to_lightning: ToBTCLNSwapState
  //   -3 REFUNDED | -2 QUOTE_EXPIRED | -1 QUOTE_SOFT_EXPIRED
  {direction: 'starknet_to_lightning', state: -3, label: 'REFUNDED',           expected: expected({isRefunded: true})},
  {direction: 'starknet_to_lightning', state: -2, label: 'QUOTE_EXPIRED',      expected: expected({isExpired: true})},
  {direction: 'starknet_to_lightning', state: -1, label: 'QUOTE_SOFT_EXPIRED', expected: NEUTRAL},

  // starknet_to_bitcoin: ToBTCSwapState (same negative values as ToBTCLN)
  {direction: 'starknet_to_bitcoin', state: -3, label: 'REFUNDED',           expected: expected({isRefunded: true})},
  {direction: 'starknet_to_bitcoin', state: -2, label: 'QUOTE_EXPIRED',      expected: expected({isExpired: true})},
  {direction: 'starknet_to_bitcoin', state: -1, label: 'QUOTE_SOFT_EXPIRED', expected: NEUTRAL},
];

// ---------------------------------------------------------------------------
// Non-negative states (happy path)
// ---------------------------------------------------------------------------
const POSITIVE_CASES: readonly Row[] = [
  // lightning_to_starknet
  //   0 PR_CREATED | 1 PR_PAID | 2 CLAIM_COMMITED | 3 CLAIM_CLAIMED
  {direction: 'lightning_to_starknet', state: 0, label: 'PR_CREATED',     expected: NEUTRAL},
  {direction: 'lightning_to_starknet', state: 1, label: 'PR_PAID',        expected: expected({isPaid: true})},
  {direction: 'lightning_to_starknet', state: 2, label: 'CLAIM_COMMITED', expected: expected({isPaid: true, isClaimable: true})},
  {direction: 'lightning_to_starknet', state: 3, label: 'CLAIM_CLAIMED',  expected: expected({isPaid: true, isClaimable: true, isCompleted: true})},

  // bitcoin_to_starknet — note paidThreshold is 2, not 1
  //   0 PR_CREATED | 1 CLAIM_COMMITED (SC escrow) | 2 BTC_TX_CONFIRMED | 3 CLAIM_CLAIMED
  {direction: 'bitcoin_to_starknet', state: 0, label: 'PR_CREATED',       expected: NEUTRAL},
  {direction: 'bitcoin_to_starknet', state: 1, label: 'CLAIM_COMMITED',   expected: NEUTRAL},
  {direction: 'bitcoin_to_starknet', state: 2, label: 'BTC_TX_CONFIRMED', expected: expected({isPaid: true, isClaimable: true})},
  {direction: 'bitcoin_to_starknet', state: 3, label: 'CLAIM_CLAIMED',    expected: expected({isPaid: true, isClaimable: true, isCompleted: true})},

  // starknet_to_lightning
  //   0 CREATED | 1 COMMITED | 2 SOFT_CLAIMED | 3 CLAIMED
  {direction: 'starknet_to_lightning', state: 0, label: 'CREATED',      expected: NEUTRAL},
  {direction: 'starknet_to_lightning', state: 1, label: 'COMMITED',     expected: expected({isPaid: true})},
  {direction: 'starknet_to_lightning', state: 2, label: 'SOFT_CLAIMED', expected: expected({isPaid: true})},
  {direction: 'starknet_to_lightning', state: 3, label: 'CLAIMED',      expected: expected({isPaid: true, isCompleted: true})},

  // starknet_to_bitcoin — adds state 4 REFUNDABLE
  {direction: 'starknet_to_bitcoin', state: 0, label: 'CREATED',      expected: NEUTRAL},
  {direction: 'starknet_to_bitcoin', state: 1, label: 'COMMITED',     expected: expected({isPaid: true})},
  {direction: 'starknet_to_bitcoin', state: 2, label: 'SOFT_CLAIMED', expected: expected({isPaid: true})},
  {direction: 'starknet_to_bitcoin', state: 3, label: 'CLAIMED',      expected: expected({isPaid: true, isCompleted: true})},
  {direction: 'starknet_to_bitcoin', state: 4, label: 'REFUNDABLE',   expected: expected({isRefundable: true})},

  // starknet_to_lightning also reaches REFUNDABLE in the ToBTCLN enum
  {direction: 'starknet_to_lightning', state: 4, label: 'REFUNDABLE',  expected: expected({isRefundable: true})},
];

describe('mapAtomiqStateToStatus — negative states', () => {
  it.each(NEGATIVE_CASES)(
    '$direction state $state ($label) → flags match',
    ({direction, state, expected: want}) => {
      expect(mapAtomiqStateToStatus(state, direction)).toStrictEqual(want);
    },
  );
});

describe('mapAtomiqStateToStatus — non-negative states', () => {
  it.each(POSITIVE_CASES)(
    '$direction state $state ($label) → flags match',
    ({direction, state, expected: want}) => {
      expect(mapAtomiqStateToStatus(state, direction)).toStrictEqual(want);
    },
  );
});

describe('mapAtomiqStateToStatus — unknown direction fallback', () => {
  it('marks state -4 as failed', () => {
    expect(mapAtomiqStateToStatus(-4, undefined)).toStrictEqual(expected({isFailed: true}));
  });

  it('marks state -3 as failed (conservative fallback: state <= -3)', () => {
    expect(mapAtomiqStateToStatus(-3, undefined)).toStrictEqual(expected({isFailed: true}));
  });

  it('marks state -2 as expired', () => {
    expect(mapAtomiqStateToStatus(-2, undefined)).toStrictEqual(expected({isExpired: true}));
  });

  it('marks state -1 as expired', () => {
    expect(mapAtomiqStateToStatus(-1, undefined)).toStrictEqual(expected({isExpired: true}));
  });

  it('leaves non-negative states neutral when direction unknown', () => {
    // No direction → isForward/isReverse both false → no claimable, no
    // refundable, paidThreshold defaults to 1, so state 1 flips isPaid.
    expect(mapAtomiqStateToStatus(0, undefined)).toStrictEqual(NEUTRAL);
    expect(mapAtomiqStateToStatus(1, undefined)).toStrictEqual(expected({isPaid: true}));
    expect(mapAtomiqStateToStatus(3, undefined)).toStrictEqual(expected({isPaid: true, isCompleted: true}));
  });
});
