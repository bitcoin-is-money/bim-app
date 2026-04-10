import {InvalidStarknetAddressError, StarknetAddress} from '@bim/domain/account';
import {ParseService, PaymentParsingError, UnsupportedNetworkError, UnsupportedTokenError} from '@bim/domain/payment';
import type {LightningDecoder} from '@bim/domain/ports';
import {type StarknetConfig, ValidationError} from '@bim/domain/shared';
import {BitcoinAddressNetworkMismatchError, InvalidBitcoinAddressError, LightningInvoice} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const LOG_LEVEL = 'trace';
const logger = createLogger(LOG_LEVEL);

// =============================================================================
// Constants
// =============================================================================

const WBTC_TOKEN_ADDRESS = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
const STRK_TOKEN_ADDRESS = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const FEE_TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const VALID_LIGHTNING_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

function testStarknetConfig(overrides?: Partial<StarknetConfig>): StarknetConfig {
  return {
    network: 'mainnet',
    bitcoinNetwork: 'mainnet',
    rpcUrl: 'http://localhost:5050',
    accountClassHash: '0x123',
    wbtcTokenAddress: WBTC_TOKEN_ADDRESS,
    strkTokenAddress: STRK_TOKEN_ADDRESS,
    feeTreasuryAddress: FEE_TREASURY_ADDRESS,
    ...overrides,
  };
}

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
        starknetConfig: testStarknetConfig(),
        logger,
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
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=1000&token=${WBTC_TOKEN_ADDRESS}`;
      const result = service.parse(uri);
      expect(result.network).toBe('starknet');
    });

    it('trims whitespace before routing', () => {
      const result = service.parse(`  ${VALID_LIGHTNING_INVOICE}  `);
      expect(result.network).toBe('lightning');
      expect(mockDecoder.decode).toHaveBeenCalled();
    });

    it('routes bare Bitcoin address (bech32) to bitcoin parser', () => {
      const result = service.parse(BTC_BECH32);
      expect(result.network).toBe('bitcoin');
      if (result.network === 'bitcoin') {
        expect(result.address).toBe(BTC_BECH32);
        expect(result.amountEditable).toBe(true);
      }
    });

    it('routes bare testnet Bitcoin address (tb1) to bitcoin parser', () => {
      const testnetService = new ParseService({
        lightningDecoder: mockDecoder,
        starknetConfig: testStarknetConfig({network: 'testnet', bitcoinNetwork: 'testnet'}),
        logger,
      });
      const testnetAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      const result = testnetService.parse(testnetAddress);
      expect(result.network).toBe('bitcoin');
      if (result.network === 'bitcoin') {
        expect(result.address).toBe(testnetAddress);
        expect(result.amountEditable).toBe(true);
      }
    });

    it('routes bare Bitcoin address with query params', () => {
      const result = service.parse(`${BTC_BECH32}?amount=0.001&label=coffeeShop`);
      expect(result.network).toBe('bitcoin');
      if (result.network === 'bitcoin') {
        expect(result.address).toBe(BTC_BECH32);
        expect(result.amount.getSat()).toBe(100_000n);
        expect(result.description).toBe('coffeeShop');
      }
    });

    it('routes bare Starknet address to starknet parser', () => {
      const result = service.parse(`${RECIPIENT_ADDRESS}?amount=1000`);
      expect(result.network).toBe('starknet');
      if (result.network === 'starknet') {
        expect(result.address).toBe(RECIPIENT_ADDRESS);
        expect(result.amount.getSat()).toBe(1_000n);
        expect(result.tokenAddress).toBe(WBTC_TOKEN_ADDRESS);
      }
    });

    it('routes bare Starknet address with explicit token', () => {
      const result = service.parse(`${RECIPIENT_ADDRESS}?amount=500&token=${WBTC_TOKEN_ADDRESS}`);
      expect(result.network).toBe('starknet');
      if (result.network === 'starknet') {
        expect(result.address).toBe(RECIPIENT_ADDRESS);
        expect(result.amount.getSat()).toBe(500n);
        expect(result.tokenAddress).toBe(WBTC_TOKEN_ADDRESS);
      }
    });

    it('routes bare Starknet address without amount as editable', () => {
      const result = service.parse(RECIPIENT_ADDRESS);
      expect(result.network).toBe('starknet');
      if (result.network === 'starknet') {
        expect(result.address).toBe(RECIPIENT_ADDRESS);
        expect(result.amount.isZero()).toBe(true);
        expect(result.amountEditable).toBe(true);
      }
    });

    it('rejects Ethereum address (0x + 40 hex) as unsupported', () => {
      try {
        service.parse('0xdAC17F958D2ee523a2206206994597C13D831ec7');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('ethereum');
      }
    });

    it('throws UnsupportedNetworkError for unrecognized data', () => {
      expect(() => service.parse('not-a-valid-address')).toThrow(UnsupportedNetworkError);
    });

    it('throws UnsupportedNetworkError for short hex strings', () => {
      expect(() => service.parse('0x1234')).toThrow(UnsupportedNetworkError);
    });

    // =========================================================================
    // Unsupported network detection
    // =========================================================================

    it('extracts network name from unsupported URI scheme', () => {
      try {
        service.parse('solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('solana');
      }
    });

    it('detects Ethereum address (0x + 40 hex)', () => {
      try {
        service.parse('0xdAC17F958D2ee523a2206206994597C13D831ec7');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('ethereum');
      }
    });

    it('detects Toncoin user-friendly address', () => {
      try {
        service.parse('EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('toncoin');
      }
    });

    it('detects Cosmos address', () => {
      try {
        service.parse('cosmos1hjct6yse4r6jmculwzafqnp9lun8hzym04g7rv');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('cosmos');
      }
    });

    it('detects Litecoin bech32 address', () => {
      try {
        service.parse('ltc1qg42tkwuuxefual00qe4lrqm3csd0dgfls7nz4y');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('litecoin');
      }
    });

    it('detects Cardano address', () => {
      try {
        service.parse('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('cardano');
      }
    });

    it('detects Ripple (XRP) address', () => {
      try {
        service.parse('rN7gj1DjMYi6TC1SwHKbrGBw4fSdPrdeCz');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('ripple');
      }
    });

    it('detects Tron address', () => {
      try {
        service.parse('TJRabPrwbZy45sbavfcjinPJC18kjpRTv8');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBe('tron');
      }
    });

    it('has no detectedNetwork for unrecognized data', () => {
      try {
        service.parse('not-a-valid-address');
        expect.fail('should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnsupportedNetworkError);
        expect((err as UnsupportedNetworkError).detectedNetwork).toBeUndefined();
      }
    });

    it('wraps sub-service errors in PaymentParsingError', () => {
      const failingDecoder = createMockDecoder();
      vi.mocked(failingDecoder.decode).mockImplementation(() => {
        throw new Error('decode failed');
      });

      const failingService = new ParseService({
        lightningDecoder: failingDecoder,
        starknetConfig: testStarknetConfig(),
        logger,
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
        starknetConfig: testStarknetConfig(),
        logger,
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
        expect(result.amountEditable).toBe(false);
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
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&summary=nftPurchase`;
      const result = service.parse(uri);
      expect(result.description).toBe('nftPurchase');
    });

    it('falls back to description param when summary is absent', () => {
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&description=tokenTransfer`;
      const result = service.parse(uri);
      expect(result.description).toBe('tokenTransfer');
    });

    it('falls back to context when summary and description are absent', () => {
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&context=dappInteraction`;
      const result = service.parse(uri);
      expect(result.description).toBe('dappInteraction');
    });

    it('prefers summary over description and context', () => {
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=1000&token=${WBTC_TOKEN_ADDRESS}&summary=topPriority&description=mid&context=low`;
      const result = service.parse(uri);
      expect(result.description).toBe('topPriority');
    });

    it('parses starknet: URI with zero amount as editable', () => {
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=0&token=${WBTC_TOKEN_ADDRESS}`;
      const result = service.parse(uri);
      expect(result.amount.isZero()).toBe(true);
      if (result.network === 'starknet') {
        expect(result.amountEditable).toBe(true);
      }
    });

    it('parses starknet: URI without amount as editable', () => {
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?token=${WBTC_TOKEN_ADDRESS}`;
      const result = service.parse(uri);
      expect(result.network).toBe('starknet');
      if (result.network === 'starknet') {
        expect(result.amount.isZero()).toBe(true);
        expect(result.amountEditable).toBe(true);
      }
    });

    it('throws UnsupportedTokenError when token is absent', () => {
      expect(() => service.parse(`starknet:${STRK_TOKEN_ADDRESS}?amount=1000`)).toThrow(UnsupportedTokenError);
    });

    it('throws UnsupportedTokenError for unsupported token', () => {
      const unknownToken = '0x0000000000000000000000000000000000000000000000000000000000abcdef';
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=1000&token=${unknownToken}`;
      expect(() => service.parse(uri)).toThrow(UnsupportedTokenError);
    });

    it('throws ValidationError when starknet amount is negative', () => {
      const uri = `starknet:${STRK_TOKEN_ADDRESS}?amount=-100&token=${WBTC_TOKEN_ADDRESS}`;
      expect(() => service.parse(uri)).toThrow(ValidationError);
    });

    it('throws InvalidStarknetAddressError for invalid address', () => {
      expect(() => service.parse('starknet:not-hex?amount=1000')).toThrow(InvalidStarknetAddressError);
    });
  });

  // ===========================================================================
  // Lightning invoice parsing
  // ===========================================================================

  describe('lightning invoice parsing', () => {
    it('detects a Lightning invoice and returns decoded data', () => {
      const service = new ParseService({
        lightningDecoder: createMockDecoder(),
        starknetConfig: testStarknetConfig(),
        logger,
      });

      const result = service.parse(VALID_LIGHTNING_INVOICE);

      expect(result.network).toBe('lightning');
      if (result.network === 'lightning') {
        expect(result.invoice).toBe(LightningInvoice.of(VALID_LIGHTNING_INVOICE));
        expect(result.amount.getSat()).toBe(50_000n);
        expect(result.description).toBe('testPayment');
        expect(result.expiresAt).toEqual(new Date('2025-06-01T00:00:00Z'));
        expect(result.amountEditable).toBe(false);
      }
    });

    it('returns amountEditable when invoice has no amount', () => {
      const service = new ParseService({
        lightningDecoder: {decode: vi.fn().mockReturnValue({description: 'test'})},
        starknetConfig: testStarknetConfig(),
        logger,
      });

      const result = service.parse(VALID_LIGHTNING_INVOICE);
      expect(result.network).toBe('lightning');
      if (result.network === 'lightning') {
        expect(result.amount.isZero()).toBe(true);
        expect(result.amountEditable).toBe(true);
      }
    });

    it('throws ValidationError when invoice has negative amount', () => {
      const service = new ParseService({
        lightningDecoder: createMockDecoder({amountMSat: BigInt(-1)}),
        starknetConfig: testStarknetConfig(),
        logger,
      });

      expect(() => service.parse(VALID_LIGHTNING_INVOICE)).toThrow(ValidationError);
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
        starknetConfig: testStarknetConfig(),
        logger,
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

    it('parses bitcoin: URI with zero amount as editable', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0`);
      expect(result.amount.isZero()).toBe(true);
      if (result.network === 'bitcoin') {
        expect(result.amountEditable).toBe(true);
      }
    });

    it('returns amountEditable when bitcoin: URI has no amount', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}`);
      expect(result.network).toBe('bitcoin');
      if (result.network === 'bitcoin') {
        expect(result.address).toBe(BTC_BECH32);
        expect(result.amount.isZero()).toBe(true);
        expect(result.amountEditable).toBe(true);
      }
    });

    it('does not set amountEditable when amount is present', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0.001`);
      if (result.network === 'bitcoin') {
        expect(result.amountEditable).toBe(false);
      }
    });

    it('throws ValidationError when bitcoin amount is negative', () => {
      expect(() => service.parse(`bitcoin:${BTC_BECH32}?amount=-0.001`)).toThrow(ValidationError);
    });

    it('throws InvalidBitcoinAddressError for invalid address', () => {
      expect(() => service.parse('bitcoin:not-a-valid-address')).toThrow(InvalidBitcoinAddressError);
    });
  });

  // ===========================================================================
  // Bitcoin address network mismatch
  // ===========================================================================

  describe('bitcoin address network mismatch', () => {
    it('throws BitcoinAddressNetworkMismatchError for testnet address on mainnet', () => {
      const mainnetService = new ParseService({
        lightningDecoder: createMockDecoder(),
        starknetConfig: testStarknetConfig(),
        logger,
      });
      expect(() => mainnetService.parse('bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx?amount=0.001'))
        .toThrow(BitcoinAddressNetworkMismatchError);
    });

    it('throws BitcoinAddressNetworkMismatchError for mainnet address on testnet', () => {
      const testnetService = new ParseService({
        lightningDecoder: createMockDecoder(),
        starknetConfig: testStarknetConfig({network: 'testnet', bitcoinNetwork: 'testnet'}),
        logger,
      });
      expect(() => testnetService.parse(`bitcoin:${BTC_BECH32}?amount=0.001`))
        .toThrow(BitcoinAddressNetworkMismatchError);
    });

    it('accepts testnet address on testnet config', () => {
      const testnetService = new ParseService({
        lightningDecoder: createMockDecoder(),
        starknetConfig: testStarknetConfig({network: 'testnet', bitcoinNetwork: 'testnet'}),
        logger,
      });
      const result = testnetService.parse('bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx?amount=0.001');
      expect(result.network).toBe('bitcoin');
    });
  });
});
