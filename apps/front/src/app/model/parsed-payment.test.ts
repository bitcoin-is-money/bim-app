import {describe, expect, it} from 'vitest';
import type {ParsePaymentResponse} from '../services/pay.http.service';
import {ParsedPayment} from './parsed-payment';

const baseAmount = {value: 50_000, currency: 'SAT' as const};
const baseFee = {value: 100, currency: 'SAT' as const};

describe('ParsedPayment.fromResponse', () => {
  it('maps a lightning invoice with expiresAt', () => {
    const response: ParsePaymentResponse = {
      network: 'lightning',
      invoice: 'lnbc...',
      amount: baseAmount,
      fee: baseFee,
      description: 'coffee',
      amountEditable: false,
      expiresAt: '2026-01-01T00:00:00Z',
    };

    const parsed = ParsedPayment.fromResponse(response);

    expect(parsed.network).toBe('lightning');
    expect(parsed.destination).toBe('lnbc...');
    expect(parsed.expiresAt).toBeInstanceOf(Date);
    expect(parsed.expiresAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.tokenAddress).toBeUndefined();
    expect(parsed.description).toBe('coffee');
  });

  it('maps a lightning invoice without expiresAt', () => {
    const response: ParsePaymentResponse = {
      network: 'lightning',
      invoice: 'lnbc...',
      amount: baseAmount,
      fee: baseFee,
      description: '',
      amountEditable: true,
    };

    const parsed = ParsedPayment.fromResponse(response);

    expect(parsed.expiresAt).toBeUndefined();
    expect(parsed.amountEditable).toBe(true);
  });

  it('maps a bitcoin payment (no tokenAddress, no expiresAt)', () => {
    const response: ParsePaymentResponse = {
      network: 'bitcoin',
      address: 'bc1q...',
      amount: baseAmount,
      fee: baseFee,
      description: 'tip',
      amountEditable: false,
    };

    const parsed = ParsedPayment.fromResponse(response);

    expect(parsed.network).toBe('bitcoin');
    expect(parsed.destination).toBe('bc1q...');
    expect(parsed.tokenAddress).toBeUndefined();
    expect(parsed.expiresAt).toBeUndefined();
  });

  it('maps a starknet payment with tokenAddress', () => {
    const response: ParsePaymentResponse = {
      network: 'starknet',
      address: '0x049d...',
      tokenAddress: '0xwbtc',
      amount: baseAmount,
      fee: baseFee,
      description: 'pay',
      amountEditable: false,
    };

    const parsed = ParsedPayment.fromResponse(response);

    expect(parsed.network).toBe('starknet');
    expect(parsed.destination).toBe('0x049d...');
    expect(parsed.tokenAddress).toBe('0xwbtc');
  });
});

describe('ParsedPayment.shortDestination', () => {
  it('returns the full destination if 20 chars or fewer', () => {
    const parsed = ParsedPayment.fromResponse({
      network: 'bitcoin',
      address: 'bc1q...',
      amount: baseAmount,
      fee: baseFee,
      description: '',
      amountEditable: false,
    });
    expect(parsed.shortDestination).toBe('bc1q...');
  });

  it('truncates long destinations to a 20 + ... + 10 layout', () => {
    const long = '0x' + '1'.repeat(64);
    const parsed = ParsedPayment.fromResponse({
      network: 'starknet',
      address: long,
      tokenAddress: '0xwbtc',
      amount: baseAmount,
      fee: baseFee,
      description: '',
      amountEditable: false,
    });
    // 20 chars + '...' + 10 chars
    expect(parsed.shortDestination.length).toBe(20 + 3 + 10);
    expect(parsed.shortDestination.startsWith(long.slice(0, 20))).toBe(true);
    expect(parsed.shortDestination.endsWith(long.slice(-10))).toBe(true);
  });
});
