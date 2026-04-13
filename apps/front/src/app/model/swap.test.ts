import {describe, expect, it} from 'vitest';
import {formatSwapDirection, getSwapTypeFromDirection, isTerminalStatus} from './swap';

describe('isTerminalStatus', () => {
  it('treats completed/expired/refunded/failed/lost as terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
    expect(isTerminalStatus('refunded')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('lost')).toBe(true);
  });

  it('treats active states as non-terminal', () => {
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('paid')).toBe(false);
    expect(isTerminalStatus('claimable')).toBe(false);
    expect(isTerminalStatus('refundable')).toBe(false);
  });

  it('keeps bitcoin_to_starknet active when expired (LP can still refund or BTC tx may land)', () => {
    expect(isTerminalStatus('expired', 'bitcoin_to_starknet')).toBe(false);
  });

  it('treats expired as terminal for other directions', () => {
    expect(isTerminalStatus('expired', 'lightning_to_starknet')).toBe(true);
    expect(isTerminalStatus('expired', 'starknet_to_lightning')).toBe(true);
    expect(isTerminalStatus('expired', 'starknet_to_bitcoin')).toBe(true);
  });
});

describe('formatSwapDirection', () => {
  it('formats every direction', () => {
    expect(formatSwapDirection('lightning_to_starknet')).toBe('Lightning Receive');
    expect(formatSwapDirection('bitcoin_to_starknet')).toBe('Bitcoin Receive');
    expect(formatSwapDirection('starknet_to_lightning')).toBe('Lightning Send');
    expect(formatSwapDirection('starknet_to_bitcoin')).toBe('Bitcoin Send');
  });
});

describe('getSwapTypeFromDirection', () => {
  it('classifies *_to_starknet as receive', () => {
    expect(getSwapTypeFromDirection('lightning_to_starknet')).toBe('receive');
    expect(getSwapTypeFromDirection('bitcoin_to_starknet')).toBe('receive');
  });

  it('classifies starknet_to_* as send', () => {
    expect(getSwapTypeFromDirection('starknet_to_lightning')).toBe('send');
    expect(getSwapTypeFromDirection('starknet_to_bitcoin')).toBe('send');
  });
});
