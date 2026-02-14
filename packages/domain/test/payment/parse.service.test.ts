import {InvalidStarknetAddressError, StarknetAddress} from '@bim/domain/account';
import {
  MissingPaymentAmountError,
  ParseService,
  PaymentParsingError,
  UnsupportedNetworkError,
  UnsupportedTokenError
} from '@bim/domain/payment';
import type {LightningDecoder} from '@bim/domain/ports';
import {ValidationError} from '@bim/domain/shared';
import {InvalidBitcoinAddressError, LightningInvoice} from '@bim/domain/swap';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// =============================================================================
// Constants
// =============================================================================

const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const STARKNET_ADDR = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const VALID_LIGHTNING_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

// =============================================================================
// Helpers
// =============================================================================

function createMockDecoder(overrides?: Partial<ReturnType<LightningDecoder['decode']>>): LightningDecoder {
  return {
    decode: vi.fn().mockReturnValue({
      amountMSat: 50_000_000n,
      description: 'testPayment',
      expiresAt: new Date('2025-06-01T00:00:00Z'),
      ...overrides,
    }),
  };
}

/**
 * Assert that calling `fn` throws a PaymentParsingError whose cause is an instance of `causeType`.
 */
function expectParsingErrorWithCause(fn: () => unknown, causeType: new (...args: any[]) => Error): void {
  try {
    fn();
    expect.unreachable('Expected function to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentParsingError);
    expect((error as PaymentParsingError).cause).toBeInstanceOf(causeType);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('ParseService', () => {
  // ===========================================================================
  // Auto-detect routing
  // ===========================================================================

  describe('auto-detect routing', () => {
    let service: ParseService;
    let mockDecoder: LightningDecoder;

    beforeEach(() => {
      mockDecoder = createMockDecoder();
      service = new ParseService({
        lightningDecoder: mockDecoder,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
      });
    });

    it('routes Lightning invoice to lightning parser', () => {
      const result = service.parse(VALID_LIGHTNING_INVOICE);
      expect(result.network).toBe('lightning');
      expect(mockDecoder.decode).toHaveBeenCalled();
    });

    it('routes bitcoin: URI to bitcoin parser', () => {
      const uri = `bitcoin:${BTC_BECH32}?amount=0.001`;
      const result = service.parse(uri);
      expect(result.network).toBe('bitcoin');
    });

    it('routes starknet: URI to starknet parser', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${WBTC_TOKEN_ADDRESS}`;
      const result = service.parse(uri);
      expect(result.network).toBe('starknet');
    });

    it('trims whitespace before routing', () => {
      const result = service.parse(`  ${VALID_LIGHTNING_INVOICE}  `);
      expect(result.network).toBe('lightning');
      expect(mockDecoder.decode).toHaveBeenCalled();
    });

    it('throws UnsupportedNetworkError for unrecognized data', () => {
      expect(() => service.parse('not-a-valid-address')).toThrow(UnsupportedNetworkError);
    });

    it('throws UnsupportedNetworkError for short hex strings', () => {
      expect(() => service.parse('0x1234')).toThrow(UnsupportedNetworkError);
    });

    it('wraps sub-service errors in PaymentParsingError', () => {
      const failingDecoder = createMockDecoder();
      vi.mocked(failingDecoder.decode).mockImplementation(() => {
        throw new Error('decode failed');
      });

      const failingService = new ParseService({
        lightningDecoder: failingDecoder,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
      });

      expect(() => failingService.parse(VALID_LIGHTNING_INVOICE)).toThrow(PaymentParsingError);
    });
  });

  // ===========================================================================
  // Starknet URI parsing
  // ===========================================================================

  describe('starknet URI parsing', () => {
    let service: ParseService;

    beforeEach(() => {
      service = new ParseService({
        lightningDecoder: createMockDecoder(),
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
      });
    });

    it('parses starknet: URI with amount and WBTC token', () => {
      const uri = `starknet:${RECIPIENT_ADDRESS}?amount=1000000&token=${WBTC_TOKEN_ADDRESS}`;
      const result = service.parse(uri);

      expect(result.network).toBe('starknet');
      if (result.network === 'starknet') {
        expect(result.address).toBe(RECIPIENT_ADDRESS);
        expect(result.amount.getSat()).toBe(1_000_000n);
        expect(result.tokenAddress).toBe(WBTC_TOKEN_ADDRESS);
        expect(result.description).toBe('');
      }
    });

    it('parses starknet: URI with short address (pads to 66 chars)', () => {
      const result = service.parse(`starknet:0x1234?amount=100&token=${WBTC_TOKEN_ADDRESS}`);

      expect(result.network).toBe('starknet');
      if (result.network === 'starknet') {
        expect(result.address).toBe(
          '0x0000000000000000000000000000000000000000000000000000000000001234',
        );
        expect(result.amount.getSat()).toBe(100n);
      }
    });

    it('uses summary as description (ERC-1138)', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&summary=nftPurchase`;
      const result = service.parse(uri);
      expect(result.description).toBe('nftPurchase');
    });

    it('falls back to description param when summary is absent', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&description=tokenTransfer`;
      const result = service.parse(uri);
      expect(result.description).toBe('tokenTransfer');
    });

    it('falls back to context when summary and description are absent', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&context=dappInteraction`;
      const result = service.parse(uri);
      expect(result.description).toBe('dappInteraction');
    });

    it('prefers summary over description and context', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&summary=topPriority&description=mid&context=low`;
      const result = service.parse(uri);
      expect(result.description).toBe('topPriority');
    });

    it('parses starknet: URI with zero amount', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=0&token=${WBTC_TOKEN_ADDRESS}`;
      const result = service.parse(uri);
      expect(result.amount.isZero()).toBe(true);
    });

    it('throws MissingPaymentAmountError for starknet: URI without amount', () => {
      expectParsingErrorWithCause(
        () => service.parse(`starknet:${STARKNET_ADDR}`),
        MissingPaymentAmountError,
      );
    });

    it('throws UnsupportedTokenError when token is absent', () => {
      expectParsingErrorWithCause(
        () => service.parse(`starknet:${STARKNET_ADDR}?amount=1000`),
        UnsupportedTokenError,
      );
    });

    it('throws UnsupportedTokenError for unsupported token', () => {
      const unknownToken = '0x0000000000000000000000000000000000000000000000000000000000abcdef';
      const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${unknownToken}`;
      expectParsingErrorWithCause(() => service.parse(uri), UnsupportedTokenError);
    });

    it('throws ValidationError when starknet amount is negative', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=-100&token=${WBTC_TOKEN_ADDRESS}`;
      expectParsingErrorWithCause(() => service.parse(uri), ValidationError);
    });

    it('throws InvalidStarknetAddressError for invalid address', () => {
      expectParsingErrorWithCause(
        () => service.parse('starknet:not-hex?amount=1000'),
        InvalidStarknetAddressError,
      );
    });
  });

  // ===========================================================================
  // Lightning invoice parsing
  // ===========================================================================

  describe('lightning invoice parsing', () => {
    it('detects a Lightning invoice and returns decoded data', () => {
      const service = new ParseService({
        lightningDecoder: createMockDecoder(),
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
      });

      const result = service.parse(VALID_LIGHTNING_INVOICE);

      expect(result.network).toBe('lightning');
      if (result.network === 'lightning') {
        expect(result.invoice).toBe(LightningInvoice.of(VALID_LIGHTNING_INVOICE));
        expect(result.amount.getSat()).toBe(50_000n);
        expect(result.description).toBe('testPayment');
        expect(result.expiresAt).toEqual(new Date('2025-06-01T00:00:00Z'));
      }
    });

    it('throws MissingPaymentAmountError when invoice has no amount', () => {
      const service = new ParseService({
        lightningDecoder: createMockDecoder({amountMSat: undefined}),
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
      });

      expectParsingErrorWithCause(
        () => service.parse(VALID_LIGHTNING_INVOICE),
        MissingPaymentAmountError,
      );
    });

    it('throws ValidationError when invoice has negative amount', () => {
      const service = new ParseService({
        lightningDecoder: createMockDecoder({amountMSat: BigInt(-1)}),
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
      });

      expectParsingErrorWithCause(
        () => service.parse(VALID_LIGHTNING_INVOICE),
        ValidationError,
      );
    });
  });

  // ===========================================================================
  // Bitcoin URI parsing
  // ===========================================================================

  describe('bitcoin URI parsing', () => {
    let service: ParseService;

    beforeEach(() => {
      service = new ParseService({
        lightningDecoder: createMockDecoder(),
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
      });
    });

    it('parses bitcoin: URI with amount', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0.001`);

      expect(result.network).toBe('bitcoin');
      if (result.network === 'bitcoin') {
        expect(result.address).toBe(BTC_BECH32);
        expect(result.amount.getSat()).toBe(100_000n);
        expect(result.description).toBe('');
      }
    });

    it('uses label as description when present', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0.001&label=coffeeShop`);
      expect(result.description).toBe('coffeeShop');
    });

    it('falls back to message when label is absent', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0.001&message=orderPayment`);
      expect(result.description).toBe('orderPayment');
    });

    it('prefers label over message', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0.001&label=shopName&message=orderNote`);
      expect(result.description).toBe('shopName');
    });

    it('parses bitcoin: URI with zero amount', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0`);
      expect(result.amount.isZero()).toBe(true);
    });

    it('throws MissingPaymentAmountError for bitcoin: URI without amount', () => {
      expectParsingErrorWithCause(
        () => service.parse(`bitcoin:${BTC_BECH32}`),
        MissingPaymentAmountError,
      );
    });

    it('throws ValidationError when bitcoin amount is negative', () => {
      expectParsingErrorWithCause(
        () => service.parse(`bitcoin:${BTC_BECH32}?amount=-0.001`),
        ValidationError,
      );
    });

    it('throws InvalidBitcoinAddressError for invalid address', () => {
      expectParsingErrorWithCause(
        () => service.parse('bitcoin:not-a-valid-address'),
        InvalidBitcoinAddressError,
      );
    });
  });
});
