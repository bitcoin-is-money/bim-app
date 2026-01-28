import {StarknetAddress} from '@bim/domain/account';
import {
  type BitcoinPaymentService,
  type LightningPaymentService,
  PaymentParsingError,
  PaymentService,
  type StarknetPaymentService,
  UnsupportedNetworkError,
} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {LightningInvoice, type SwapService} from '@bim/domain/swap';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const VALID_LIGHTNING_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';
const STARKNET_ADDR = '0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321';
const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

describe('PaymentService - parse (auto-detect routing)', () => {
  let service: PaymentService;
  let mockStarknet: StarknetPaymentService;
  let mockLightning: LightningPaymentService;
  let mockBitcoin: BitcoinPaymentService;

  beforeEach(() => {
    mockStarknet = {
      parse: vi.fn().mockReturnValue({
        network: 'starknet',
        address: StarknetAddress.of(STARKNET_ADDR),
        amount: Amount.ofSatoshi(1000n),
        tokenAddress: WBTC_TOKEN_ADDRESS,
        description: '',
      }),
      pay: vi.fn(),
      receive: vi.fn(),
    } as unknown as StarknetPaymentService;

    mockLightning = {
      parse: vi.fn().mockReturnValue({
        network: 'lightning',
        invoice: LightningInvoice.of(VALID_LIGHTNING_INVOICE),
        amount: Amount.ofSatoshi(50_000n),
        description: 'test',
      }),
      pay: vi.fn(),
      receive: vi.fn(),
    } as unknown as LightningPaymentService;

    mockBitcoin = {
      parse: vi.fn().mockReturnValue({
        network: 'bitcoin',
        address: BTC_BECH32,
        amount: Amount.ofSatoshi(100_000n),
        description: '',
      }),
      pay: vi.fn(),
      receive: vi.fn(),
    } as unknown as BitcoinPaymentService;

    service = new PaymentService({
      starknet: mockStarknet,
      lightning: mockLightning,
      bitcoin: mockBitcoin,
      swapService: {} as unknown as SwapService,
    });
  });

  it('routes Lightning invoice to lightning sub-service', () => {
    service.parse(VALID_LIGHTNING_INVOICE);
    expect(mockLightning.parse).toHaveBeenCalledWith(VALID_LIGHTNING_INVOICE);
  });

  it('routes bitcoin: URI to bitcoin sub-service', () => {
    const uri = `bitcoin:${BTC_BECH32}?amount=0.001`;
    service.parse(uri);
    expect(mockBitcoin.parse).toHaveBeenCalledWith(uri);
  });

  it('routes starknet: URI to starknet sub-service', () => {
    const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${WBTC_TOKEN_ADDRESS}`;
    service.parse(uri);
    expect(mockStarknet.parse).toHaveBeenCalledWith(uri);
  });

  it('trims whitespace before routing', () => {
    service.parse(`  ${VALID_LIGHTNING_INVOICE}  `);
    expect(mockLightning.parse).toHaveBeenCalledWith(VALID_LIGHTNING_INVOICE);
  });

  it('throws UnsupportedNetworkError for unrecognized data', () => {
    expect(() => service.parse('not-a-valid-address')).toThrow(UnsupportedNetworkError);
  });

  it('throws UnsupportedNetworkError for short hex strings', () => {
    expect(() => service.parse('0x1234')).toThrow(UnsupportedNetworkError);
  });

  it('wraps sub-service errors in PaymentParsingError', () => {
    vi.mocked(mockLightning.parse).mockImplementation(() => {
      throw new Error('decode failed');
    });

    expect(() => service.parse(VALID_LIGHTNING_INVOICE)).toThrow(PaymentParsingError);
  });

  it('exposes sub-services as readonly properties', () => {
    expect(service.starknet).toBe(mockStarknet);
    expect(service.lightning).toBe(mockLightning);
    expect(service.bitcoin).toBe(mockBitcoin);
  });
});
