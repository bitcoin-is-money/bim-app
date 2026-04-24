import {StarknetAddress} from '@bim/domain/account';
import {
  FeeCalculator,
  FeeConfig,
  type PaymentParser,
  PaymentPreparator,
} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {BitcoinAddress, LightningInvoice, type SwapService} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const logger = createLogger('silent');

const WBTC_TOKEN_ADDRESS = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
const ETH_TOKEN_ADDRESS = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';
const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const feeConfig = FeeConfig.create({
  percentages: FeeConfig.DEFAULT_PERCENTAGES,
  recipientAddress: TREASURY_ADDRESS,
});

describe('PaymentPreparator', () => {
  let service: PaymentPreparator;
  let mockPaymentParser: PaymentParser;
  let mockSwapService: SwapService;

  beforeEach(() => {
    vi.resetAllMocks();

    mockPaymentParser = {
      parse: vi.fn(),
    } as unknown as PaymentParser;

    mockSwapService = {
      fetchLimits: vi.fn().mockResolvedValue({
        limits: {minSats: 1n, maxSats: BigInt(Number.MAX_SAFE_INTEGER), feePercent: 0.3},
      }),
    } as unknown as SwapService;

    service = new PaymentPreparator({
      paymentParser: mockPaymentParser,
      swapService: mockSwapService,
      feeConfig,
      logger,
    });
  });

  it('applies BIM fee for starknet payments', async () => {
    const amount = Amount.ofSatoshi(100_000_000n);
    vi.mocked(mockPaymentParser.parse).mockReturnValue({
      network: 'starknet',
      address: RECIPIENT_ADDRESS,
      amount,
      amountEditable: false,
      tokenAddress: ETH_TOKEN_ADDRESS,
      description: '',
    });

    const result = await service.prepare('starknet:...');

    const expectedFee = FeeCalculator.calculateFee(amount, feeConfig.percentageFor('starknet'));
    expect(result.network).toBe('starknet');
    expect(result.fee.getSat()).toBe(expectedFee.getSat());
  });

  it('estimates LP fee + BIM fee for lightning payments', async () => {
    const amount = Amount.ofSatoshi(50_000n);
    vi.mocked(mockPaymentParser.parse).mockReturnValue({
      network: 'lightning',
      invoice: LightningInvoice.of(VALID_INVOICE),
      amount,
      amountEditable: false,
      description: 'test',
    });

    const result = await service.prepare(VALID_INVOICE);

    const lpFee = FeeCalculator.calculateFee(amount, 0.3 / 100);
    const bimFee = FeeCalculator.calculateFee(amount, feeConfig.percentageFor('lightning'));
    expect(result.network).toBe('lightning');
    expect(result.fee.getSat()).toBe(lpFee.getSat() + bimFee.getSat());
    expect(mockSwapService.fetchLimits).toHaveBeenCalledWith({direction: 'starknet_to_lightning'});
  });

  it('estimates LP fee + BIM fee for bitcoin payments', async () => {
    const amount = Amount.ofSatoshi(100_000n);
    vi.mocked(mockPaymentParser.parse).mockReturnValue({
      network: 'bitcoin',
      address: BitcoinAddress.of(BTC_BECH32),
      amount,
      amountEditable: false,
      description: '',
    });

    const result = await service.prepare(`bitcoin:${BTC_BECH32}?amount=0.001`);

    const lpFee = FeeCalculator.calculateFee(amount, 0.3 / 100);
    const bimFee = FeeCalculator.calculateFee(amount, feeConfig.percentageFor('bitcoin'));
    expect(result.network).toBe('bitcoin');
    expect(result.fee.getSat()).toBe(lpFee.getSat() + bimFee.getSat());
    expect(mockSwapService.fetchLimits).toHaveBeenCalledWith({direction: 'starknet_to_bitcoin'});
  });

  it('accepts already-parsed data and skips paymentParser', async () => {
    const amount = Amount.ofSatoshi(1_000_000n);
    const parsed = {
      network: 'starknet' as const,
      address: RECIPIENT_ADDRESS,
      amount,
      amountEditable: false,
      tokenAddress: WBTC_TOKEN_ADDRESS,
      description: '',
    };

    const result = await service.prepare(parsed);

    expect(mockPaymentParser.parse).not.toHaveBeenCalled();
    expect(result.network).toBe('starknet');
    if (result.network === 'starknet') {
      expect(result.address).toBe(RECIPIENT_ADDRESS);
    }
  });
});
