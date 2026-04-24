import {StarknetAddress} from '@bim/domain/account';
import {
  Erc20CallFactory,
  FeeCalculator,
  FeeConfig,
  InvalidPaymentAmountError,
  type ParsedPaymentData,
  PaymentBuildCache,
  PaymentBuilder,
  type PaymentParser,
  type PaymentPreparator,
  SameAddressPaymentError,
} from '@bim/domain/payment';
import type {StarknetGateway} from '@bim/domain/ports';
import {AccountNotDeployedError, Amount} from '@bim/domain/shared';
import {
  BitcoinAddress,
  LightningInvoice,
  Swap,
  SwapAmountError,
  SwapCreationError,
  SwapId,
  type SwapCoordinator,
} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount} from '../../helper';

const logger = createLogger('silent');

const ETH_TOKEN_ADDRESS = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
const STRK_TOKEN_ADDRESS = StarknetAddress.of('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const WBTC_TOKEN_ADDRESS = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
const SENDER_ADDRESS = StarknetAddress.of('0x0111111111111111111111111111111111111111111111111111111111111111');
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const DEPOSIT_ADDRESS = '0x05abbccdd00112233445566778899aabbccdd00112233445566778899aabbcc';
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';
const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

const feeConfig = FeeConfig.create({
  percentages: FeeConfig.DEFAULT_PERCENTAGES,
  recipientAddress: TREASURY_ADDRESS,
});

const starknetConfig = {
  network: 'mainnet' as const,
  bitcoinNetwork: 'mainnet' as const,
  rpcUrl: 'http://localhost:5050',
  accountClassHash: '0x123',
  wbtcTokenAddress: WBTC_TOKEN_ADDRESS,
  strkTokenAddress: STRK_TOKEN_ADDRESS,
  feeTreasuryAddress: TREASURY_ADDRESS,
};

function createMockLightningPaySwap(): Swap {
  return Swap.createStarknetToLightning({
    id: SwapId.of('swap-123'),
    amount: Amount.ofSatoshi(50_000n),
    sourceAddress: SENDER_ADDRESS,
    invoice: LightningInvoice.of(VALID_INVOICE),
    depositAddress: DEPOSIT_ADDRESS,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    description: 'Sent',
    accountId: ACCOUNT_ID,
  });
}

function createMockBitcoinPaySwap(): Swap {
  return Swap.createStarknetToBitcoin({
    id: SwapId.of('swap-btc-456'),
    amount: Amount.ofSatoshi(100_000n),
    sourceAddress: SENDER_ADDRESS,
    destinationAddress: BitcoinAddress.of(BTC_BECH32),
    depositAddress: DEPOSIT_ADDRESS,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    description: 'Sent',
    accountId: ACCOUNT_ID,
  });
}

describe('PaymentBuilder', () => {
  let service: PaymentBuilder;
  let mockPaymentParser: PaymentParser;
  let mockPaymentPreparator: PaymentPreparator;
  let mockSwapCoordinator: SwapCoordinator;
  let mockStarknetGateway: StarknetGateway;
  let paymentBuildCache: PaymentBuildCache;

  beforeEach(() => {
    vi.resetAllMocks();

    mockPaymentParser = {
      parse: vi.fn(),
    } as unknown as PaymentParser;

    mockPaymentPreparator = {
      prepare: vi.fn(),
    } as unknown as PaymentPreparator;

    mockSwapCoordinator = {
      createStarknetToLightning: vi.fn(),
      createStarknetToBitcoin: vi.fn(),
    } as unknown as SwapCoordinator;

    mockStarknetGateway = {
      buildCalls: vi.fn().mockResolvedValue({typedData: {mock: true}, messageHash: '0xabc'}),
    } as unknown as StarknetGateway;

    paymentBuildCache = new PaymentBuildCache();

    service = new PaymentBuilder({
      paymentParser: mockPaymentParser,
      paymentPreparator: mockPaymentPreparator,
      erc20CallFactory: new Erc20CallFactory(feeConfig),
      swapCoordinator: mockSwapCoordinator,
      starknetGateway: mockStarknetGateway,
      paymentBuildCache,
      starknetConfig,
      logger,
    });
  });

  // ===========================================================================
  // Orchestration
  // ===========================================================================

  describe('orchestration', () => {
    function primeStarknet(parsed?: Partial<ParsedPaymentData & {network: 'starknet'}>): void {
      const full: ParsedPaymentData = {
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(10_000n),
        amountEditable: false,
        tokenAddress: WBTC_TOKEN_ADDRESS,
        description: 'Test',
        ...(parsed ?? {}),
      } as ParsedPaymentData;
      vi.mocked(mockPaymentParser.parse).mockReturnValue(full);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({
        ...full,
        fee: Amount.ofSatoshi(100n),
      });
    }

    it('throws AccountNotDeployedError when account is not deployed', async () => {
      const account = createAccount('pending');
      await expect(
        service.build({paymentPayload: 'starknet:0x1', account}),
      ).rejects.toThrow(AccountNotDeployedError);
    });

    it('returns buildId, messageHash, credentialId and prepared data', async () => {
      primeStarknet();
      const account = createAccount('deployed');

      const result = await service.build({
        paymentPayload: 'starknet:0x1',
        description: 'My payment',
        account,
      });

      const expectedFee = FeeCalculator.calculateFee(
        Amount.ofSatoshi(10_000n),
        feeConfig.percentageFor('starknet'),
      );
      expect(result.buildId).toBeDefined();
      expect(result.messageHash).toBe('0xabc');
      expect(result.credentialId).toBe(account.credentialId);
      expect(result.prepared.network).toBe('starknet');
      expect(result.feeAmount.getSat()).toBe(expectedFee.getSat());
    });

    it('caches build data for the execute step', async () => {
      primeStarknet();
      const account = createAccount('deployed');

      const result = await service.build({paymentPayload: 'starknet:0x1', account});

      const cached = paymentBuildCache.consume(result.buildId);
      expect(cached).toBeDefined();
      expect(cached?.accountId).toBe(account.id);
      expect(cached?.description).toBe('Test');
    });

    it('uses input description over parsed description', async () => {
      primeStarknet();
      const account = createAccount('deployed');

      const result = await service.build({
        paymentPayload: 'starknet:0x1',
        description: 'Custom desc',
        account,
      });

      const cached = paymentBuildCache.consume(result.buildId);
      expect(cached?.description).toBe('Custom desc');
    });
  });

  // ===========================================================================
  // Starknet call construction
  // ===========================================================================

  describe('starknet calls', () => {
    it('creates transfer + fee call and caches the prepared data', async () => {
      const parsed: ParsedPaymentData = {
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        amountEditable: false,
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      };
      vi.mocked(mockPaymentParser.parse).mockReturnValue(parsed);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({...parsed, fee: Amount.ofSatoshi(300_000n)});

      const account = createAccount('deployed', undefined, SENDER_ADDRESS);
      const result = await service.build({paymentPayload: 'starknet:...', account});

      const cached = paymentBuildCache.consume(result.buildId);
      expect(cached?.preparedCalls.network).toBe('starknet');
      if (cached?.preparedCalls.network !== 'starknet') throw new Error('Expected starknet');

      const expectedFee = FeeCalculator.calculateFee(parsed.amount, feeConfig.percentageFor('starknet'));
      expect(cached.preparedCalls.calls).toHaveLength(2);
      expect(cached.preparedCalls.calls[0]).toEqual({
        contractAddress: ETH_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: [RECIPIENT_ADDRESS, '100000000', '0'],
      });
      expect(cached.preparedCalls.calls[1]!.calldata[0]).toBe(TREASURY_ADDRESS.toString());
      expect(cached.preparedCalls.feeAmount.getSat()).toBe(expectedFee.getSat());
      expect(cached.preparedCalls.recipientAddress).toBe(RECIPIENT_ADDRESS);
    });

    it('creates a single transfer call when the fee rounds to zero', async () => {
      const parsed: ParsedPaymentData = {
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.ofMilliSatoshi(999n),
        amountEditable: false,
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      };
      vi.mocked(mockPaymentParser.parse).mockReturnValue(parsed);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({...parsed, fee: Amount.zero()});

      const account = createAccount('deployed', undefined, SENDER_ADDRESS);
      const result = await service.build({paymentPayload: 'starknet:...', account});

      const cached = paymentBuildCache.consume(result.buildId);
      if (cached?.preparedCalls.network !== 'starknet') throw new Error('Expected starknet');
      expect(cached.preparedCalls.feeAmount.isZero()).toBe(true);
      expect(cached.preparedCalls.calls).toHaveLength(1);
    });

    it('throws InvalidPaymentAmountError when parsed amount is 0', async () => {
      const parsed: ParsedPaymentData = {
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.zero(),
        amountEditable: true,
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      };
      vi.mocked(mockPaymentParser.parse).mockReturnValue(parsed);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({...parsed, fee: Amount.zero()});

      const account = createAccount('deployed', undefined, SENDER_ADDRESS);

      const error = await service.build({paymentPayload: 'starknet:...', account}).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(InvalidPaymentAmountError);
      expect((error as InvalidPaymentAmountError).args).toEqual({network: 'starknet', amount: 0, unit: 'sats'});
    });

    it('throws SameAddressPaymentError when sender equals recipient', async () => {
      const parsed: ParsedPaymentData = {
        network: 'starknet',
        address: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(1_000n),
        amountEditable: false,
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      };
      vi.mocked(mockPaymentParser.parse).mockReturnValue(parsed);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({...parsed, fee: Amount.zero()});

      const account = createAccount('deployed', undefined, SENDER_ADDRESS);

      await expect(
        service.build({paymentPayload: 'starknet:...', account}),
      ).rejects.toThrow(SameAddressPaymentError);
    });
  });

  // ===========================================================================
  // Lightning call construction
  // ===========================================================================

  describe('lightning calls', () => {
    beforeEach(() => {
      const parsed: ParsedPaymentData = {
        network: 'lightning',
        invoice: LightningInvoice.of(VALID_INVOICE),
        amount: Amount.ofSatoshi(50_000n),
        amountEditable: false,
        description: 'test',
      };
      vi.mocked(mockPaymentParser.parse).mockReturnValue(parsed);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({...parsed, fee: Amount.ofSatoshi(250n)});
      vi.mocked(mockSwapCoordinator.createStarknetToLightning).mockResolvedValue({
        swap: createMockLightningPaySwap(),
        commitCalls: [
          {contractAddress: '0x0123456789abcdef', entrypoint: 'approve', calldata: ['0x1', '0x2']},
          {contractAddress: '0x0123456789abcdef', entrypoint: 'initiate', calldata: ['0x3', '0x4']},
        ],
        amount: Amount.ofSatoshi(50_000n),
      });
    });

    it('creates swap and returns SDK commit calls with BIM fee call', async () => {
      const account = createAccount('deployed', undefined, SENDER_ADDRESS);
      const result = await service.build({paymentPayload: VALID_INVOICE, account});

      expect(mockSwapCoordinator.createStarknetToLightning).toHaveBeenCalledWith({
        invoice: LightningInvoice.of(VALID_INVOICE),
        sourceAddress: SENDER_ADDRESS,
        accountId: account.id,
        description: 'test',
      });

      const cached = paymentBuildCache.consume(result.buildId);
      if (cached?.preparedCalls.network !== 'lightning') throw new Error('Expected lightning');

      const expectedBimFee = FeeCalculator.calculateFee(
        Amount.ofSatoshi(50_000n),
        feeConfig.percentageFor('lightning'),
      );
      expect(cached.preparedCalls.calls).toHaveLength(3);
      expect(cached.preparedCalls.calls[2]).toEqual({
        contractAddress: WBTC_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: [TREASURY_ADDRESS.toString(), expectedBimFee.getSat().toString(), '0'],
      });
      expect(cached.preparedCalls.feeAmount.getSat()).toBe(expectedBimFee.getSat());
      expect(cached.preparedCalls.swapId).toBe(SwapId.of('swap-123'));
      expect(cached.preparedCalls.invoice).toBe(LightningInvoice.of(VALID_INVOICE));
    });

    it('propagates SwapAmountError from swap service', async () => {
      vi.mocked(mockSwapCoordinator.createStarknetToLightning).mockRejectedValue(
        new SwapAmountError(
          Amount.ofSatoshi(50_000n),
          Amount.ofSatoshi(100_000n),
          Amount.ofSatoshi(1_000_000n),
        ),
      );
      const account = createAccount('deployed', undefined, SENDER_ADDRESS);

      await expect(
        service.build({paymentPayload: VALID_INVOICE, account}),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapCoordinator.createStarknetToLightning).mockRejectedValue(
        new SwapCreationError('Atomiq service unavailable'),
      );
      const account = createAccount('deployed', undefined, SENDER_ADDRESS);

      await expect(
        service.build({paymentPayload: VALID_INVOICE, account}),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // Bitcoin call construction
  // ===========================================================================

  describe('bitcoin calls', () => {
    beforeEach(() => {
      const parsed: ParsedPaymentData = {
        network: 'bitcoin',
        address: BitcoinAddress.of(BTC_BECH32),
        amount: Amount.ofSatoshi(100_000n),
        amountEditable: false,
        description: '',
      };
      vi.mocked(mockPaymentParser.parse).mockReturnValue(parsed);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({...parsed, fee: Amount.ofSatoshi(600n)});
      vi.mocked(mockSwapCoordinator.createStarknetToBitcoin).mockResolvedValue({
        swap: createMockBitcoinPaySwap(),
        commitCalls: [
          {contractAddress: '0x0123456789abcdef', entrypoint: 'approve', calldata: ['0x1', '0x2']},
          {contractAddress: '0x0123456789abcdef', entrypoint: 'initiate', calldata: ['0x3', '0x4']},
        ],
        amount: Amount.ofSatoshi(101_000n),
      });
    });

    it('creates swap and returns SDK commit calls with BIM fee call', async () => {
      const account = createAccount('deployed', undefined, SENDER_ADDRESS);
      const result = await service.build({paymentPayload: `bitcoin:${BTC_BECH32}?amount=0.001`, account});

      expect(mockSwapCoordinator.createStarknetToBitcoin).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(100_000n),
        destinationAddress: BitcoinAddress.of(BTC_BECH32),
        sourceAddress: SENDER_ADDRESS,
        accountId: account.id,
        description: 'Sent',
      });

      const cached = paymentBuildCache.consume(result.buildId);
      if (cached?.preparedCalls.network !== 'bitcoin') throw new Error('Expected bitcoin');

      const expectedBimFee = FeeCalculator.calculateFee(
        Amount.ofSatoshi(100_000n),
        feeConfig.percentageFor('bitcoin'),
      );
      expect(cached.preparedCalls.calls).toHaveLength(3);
      expect(cached.preparedCalls.amount.getSat()).toBe(101_000n);
      expect(cached.preparedCalls.feeAmount.getSat()).toBe(expectedBimFee.getSat());
      expect(cached.preparedCalls.swapId).toBe(SwapId.of('swap-btc-456'));
      expect(cached.preparedCalls.destinationAddress).toBe(BitcoinAddress.of(BTC_BECH32));
    });

    it('throws InvalidPaymentAmountError when amount is 0', async () => {
      const zeroParsed: ParsedPaymentData = {
        network: 'bitcoin',
        address: BitcoinAddress.of(BTC_BECH32),
        amount: Amount.zero(),
        amountEditable: true,
        description: '',
      };
      vi.mocked(mockPaymentParser.parse).mockReturnValue(zeroParsed);
      vi.mocked(mockPaymentPreparator.prepare).mockResolvedValue({...zeroParsed, fee: Amount.zero()});

      const account = createAccount('deployed', undefined, SENDER_ADDRESS);

      await expect(
        service.build({paymentPayload: `bitcoin:${BTC_BECH32}`, account}),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });

    it('propagates SwapAmountError from swap service', async () => {
      vi.mocked(mockSwapCoordinator.createStarknetToBitcoin).mockRejectedValue(
        new SwapAmountError(
          Amount.ofSatoshi(100_000n),
          Amount.ofSatoshi(500_000n),
          Amount.ofSatoshi(10_000_000n),
        ),
      );
      const account = createAccount('deployed', undefined, SENDER_ADDRESS);

      await expect(
        service.build({paymentPayload: `bitcoin:${BTC_BECH32}?amount=0.001`, account}),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapCoordinator.createStarknetToBitcoin).mockRejectedValue(
        new SwapCreationError('Service unavailable'),
      );
      const account = createAccount('deployed', undefined, SENDER_ADDRESS);

      await expect(
        service.build({paymentPayload: `bitcoin:${BTC_BECH32}?amount=0.001`, account}),
      ).rejects.toThrow(SwapCreationError);
    });
  });
});
