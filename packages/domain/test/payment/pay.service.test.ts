import {StarknetAddress} from '@bim/domain/account';
import {
  Erc20CallFactory,
  FeeCalculator,
  FeeConfig,
  InvalidPaymentAmountError,
  type ParsedPaymentData,
  type ParseService,
  PayService,
  SameAddressPaymentError
} from '@bim/domain/payment';
import type {StarknetGateway, TransactionRepository} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {
  BitcoinAddress,
  LightningInvoice,
  Swap,
  SwapAmountError,
  SwapCreationError,
  SwapId,
  type SwapService
} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const LOG_LEVEL = 'silent';
const logger = createLogger(LOG_LEVEL);

// =============================================================================
// Constants
// =============================================================================

const ETH_TOKEN_ADDRESS = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
const STRK_TOKEN_ADDRESS = StarknetAddress.of('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const WBTC_TOKEN_ADDRESS = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
const SENDER_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const DEPOSIT_ADDRESS = '0x05abbccdd00112233445566778899aabbccdd00112233445566778899aabbcc';
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';
const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

function createMockTransactionRepository(): TransactionRepository {
  return {
    saveDescription: vi.fn().mockResolvedValue(undefined),
    deleteDescription: vi.fn().mockResolvedValue(undefined),
    findByAccountId: vi.fn(),
    findById: vi.fn(),
    findByHash: vi.fn(),
  } as unknown as TransactionRepository;
}

// =============================================================================
// Swap Factories
// =============================================================================

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

// =============================================================================
// Shared Setup
// =============================================================================

const feeConfig = FeeConfig.create({
  percentages: FeeConfig.DEFAULT_PERCENTAGES,
  recipientAddress: TREASURY_ADDRESS,
});

const mockParseService = {
  parse: vi.fn(),
} as unknown as ParseService;

describe('PayService', () => {
  // ===========================================================================
  // PREPARE CALLS — Starknet
  // ===========================================================================

  describe('prepareCalls — starknet', () => {
    let service: PayService;

    const starknetParsed: ParsedPaymentData = {
      network: 'starknet',
      address: RECIPIENT_ADDRESS,
      amount: Amount.ofSatoshi(100_000_000n),
      tokenAddress: ETH_TOKEN_ADDRESS,
      description: '',
    };

    beforeEach(() => {
      vi.resetAllMocks();

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory(feeConfig),
        starknetGateway: {} as unknown as StarknetGateway,
        swapService: {} as unknown as SwapService,
        transactionRepository: createMockTransactionRepository(),
        starknetConfig: {network: 'mainnet', bitcoinNetwork: 'mainnet', rpcUrl: 'http://localhost:5050', accountClassHash: '0x123', wbtcTokenAddress: WBTC_TOKEN_ADDRESS, strkTokenAddress: STRK_TOKEN_ADDRESS, feeTreasuryAddress: TREASURY_ADDRESS},
        feeConfig,
        logger,
      });
    });

    it('returns starknet calls with transfer + fee', async () => {
      const result = await service.prepareCalls(starknetParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent');

      expect(result.network).toBe('starknet');
      if (result.network !== 'starknet') return;

      const expectedFee = FeeCalculator.calculateFee(
        Amount.ofSatoshi(100_000_000n),
        feeConfig.percentageFor('starknet'),
      );

      expect(result.calls).toHaveLength(2);
      expect(result.calls[0]).toEqual({
        contractAddress: ETH_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: [RECIPIENT_ADDRESS, '100000000', '0'],
      });
      expect(result.calls[1]!.calldata[0]).toBe(TREASURY_ADDRESS.toString());
      expect(result.amount.getSat()).toBe(100_000_000n);
      expect(result.feeAmount.getSat()).toBe(expectedFee.getSat());
      expect(result.recipientAddress).toBe(RECIPIENT_ADDRESS);
      expect(result.tokenAddress).toBe(ETH_TOKEN_ADDRESS);
    });

    it('returns single transfer call when fee rounds to zero', async () => {
      const smallParsed: ParsedPaymentData = {
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.ofMilliSatoshi(999n),
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      };

      const result = await service.prepareCalls(smallParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent');

      if (result.network !== 'starknet') return;
      expect(result.feeAmount.isZero()).toBe(true);
      expect(result.calls).toHaveLength(1);
    });

    it('throws InvalidPaymentAmountError when parsed amount is 0', async () => {
      const zeroParsed: ParsedPaymentData = {
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.zero(),
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      };

      await expect(
        service.prepareCalls(zeroParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent'),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });

    it('throws SameAddressPaymentError when sender equals recipient', async () => {
      const selfParsed: ParsedPaymentData = {
        network: 'starknet',
        address: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(1_000n),
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      };

      await expect(
        service.prepareCalls(selfParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent'),
      ).rejects.toThrow(SameAddressPaymentError);
    });
  });

  // ===========================================================================
  // PREPARE CALLS — Lightning
  // ===========================================================================

  describe('prepareCalls — lightning', () => {
    let service: PayService;
    let mockSwapService: SwapService;

    const lightningParsed: ParsedPaymentData = {
      network: 'lightning',
      invoice: LightningInvoice.of(VALID_INVOICE),
      amount: Amount.ofSatoshi(50_000n),
      description: 'test',
    };

    beforeEach(() => {
      vi.resetAllMocks();

      mockSwapService = {
        createStarknetToLightning: vi.fn().mockResolvedValue({
          swap: createMockLightningPaySwap(),
          commitCalls: [
            {contractAddress: '0x0123456789abcdef', entrypoint: 'approve', calldata: ['0x1', '0x2']},
            {contractAddress: '0x0123456789abcdef', entrypoint: 'initiate', calldata: ['0x3', '0x4']},
          ],
          amount: Amount.ofSatoshi(50_000n),
        }),
      } as unknown as SwapService;

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory(feeConfig),
        starknetGateway: {} as unknown as StarknetGateway,
        swapService: mockSwapService,
        transactionRepository: createMockTransactionRepository(),
        starknetConfig: {network: 'mainnet', bitcoinNetwork: 'mainnet', rpcUrl: 'http://localhost:5050', accountClassHash: '0x123', wbtcTokenAddress: WBTC_TOKEN_ADDRESS, strkTokenAddress: STRK_TOKEN_ADDRESS, feeTreasuryAddress: TREASURY_ADDRESS},
        feeConfig,
        logger,
      });
    });

    it('creates swap and returns SDK commit calls with BIM fee call', async () => {
      const result = await service.prepareCalls(lightningParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent');

      expect(mockSwapService.createStarknetToLightning).toHaveBeenCalledWith({
        invoice: LightningInvoice.of(VALID_INVOICE),
        sourceAddress: SENDER_ADDRESS,
        accountId: ACCOUNT_ID,
        description: 'Sent',
      });

      expect(result.network).toBe('lightning');
      if (result.network !== 'lightning') return;

      const expectedBimFee = FeeCalculator.calculateFee(
        Amount.ofSatoshi(50_000n),
        feeConfig.percentageFor('lightning'),
      );

      // 2 commit calls (approve + initiate) + 1 BIM fee call
      expect(result.calls).toHaveLength(3);
      expect(result.calls[0]).toEqual({
        contractAddress: '0x0123456789abcdef',
        entrypoint: 'approve',
        calldata: ['0x1', '0x2'],
      });
      expect(result.calls[1]).toEqual({
        contractAddress: '0x0123456789abcdef',
        entrypoint: 'initiate',
        calldata: ['0x3', '0x4'],
      });
      // Fee call: BIM lightning fee on 50,000 sats, sent to treasury in WBTC
      expect(result.calls[2]).toEqual({
        contractAddress: WBTC_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: [TREASURY_ADDRESS.toString(), expectedBimFee.getSat().toString(), '0'],
      });
      expect(result.amount.getSat()).toBe(50_000n);
      expect(result.feeAmount.getSat()).toBe(expectedBimFee.getSat());
      expect(result.swapId).toBe(SwapId.of('swap-123'));
      expect(result.invoice).toBe(LightningInvoice.of(VALID_INVOICE));
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('propagates SwapAmountError from swap service', async () => {
      vi.mocked(mockSwapService.createStarknetToLightning).mockRejectedValue(
        new SwapAmountError(
          Amount.ofSatoshi(50_000n),
          Amount.ofSatoshi(100_000n),
          Amount.ofSatoshi(1_000_000n),
        ),
      );

      await expect(
        service.prepareCalls(lightningParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent'),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createStarknetToLightning).mockRejectedValue(
        new SwapCreationError('Atomiq service unavailable'),
      );

      await expect(
        service.prepareCalls(lightningParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent'),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // PREPARE CALLS — Bitcoin
  // ===========================================================================

  describe('prepareCalls — bitcoin', () => {
    let service: PayService;
    let mockSwapService: SwapService;

    const bitcoinParsed: ParsedPaymentData = {
      network: 'bitcoin',
      address: BitcoinAddress.of(BTC_BECH32),
      amount: Amount.ofSatoshi(100_000n),
      description: '',
    };

    beforeEach(() => {
      vi.resetAllMocks();

      mockSwapService = {
        createStarknetToBitcoin: vi.fn().mockResolvedValue({
          swap: createMockBitcoinPaySwap(),
          commitCalls: [
            {contractAddress: '0x0123456789abcdef', entrypoint: 'approve', calldata: ['0x1', '0x2']},
            {contractAddress: '0x0123456789abcdef', entrypoint: 'initiate', calldata: ['0x3', '0x4']},
          ],
          amount: Amount.ofSatoshi(101_000n), // LP-quoted amount (includes LP fee)
        }),
      } as unknown as SwapService;

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory(feeConfig),
        starknetGateway: {} as unknown as StarknetGateway,
        swapService: mockSwapService,
        transactionRepository: createMockTransactionRepository(),
        starknetConfig: {network: 'mainnet', bitcoinNetwork: 'mainnet', rpcUrl: 'http://localhost:5050', accountClassHash: '0x123', wbtcTokenAddress: WBTC_TOKEN_ADDRESS, strkTokenAddress: STRK_TOKEN_ADDRESS, feeTreasuryAddress: TREASURY_ADDRESS},
        feeConfig,
        logger,
      });
    });

    it('creates swap and returns SDK commit calls with BIM fee call', async () => {
      const result = await service.prepareCalls(bitcoinParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent');

      expect(mockSwapService.createStarknetToBitcoin).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(100_000n),
        destinationAddress: BitcoinAddress.of(BTC_BECH32),
        sourceAddress: SENDER_ADDRESS,
        accountId: ACCOUNT_ID,
        description: 'Sent',
      });

      expect(result.network).toBe('bitcoin');
      if (result.network !== 'bitcoin') return;

      const expectedBimFee = FeeCalculator.calculateFee(
        Amount.ofSatoshi(100_000n),
        feeConfig.percentageFor('bitcoin'),
      );

      // 2 commit calls (approve + initiate) + 1 BIM fee call
      expect(result.calls).toHaveLength(3);
      expect(result.calls[0]).toEqual({
        contractAddress: '0x0123456789abcdef',
        entrypoint: 'approve',
        calldata: ['0x1', '0x2'],
      });
      expect(result.calls[1]).toEqual({
        contractAddress: '0x0123456789abcdef',
        entrypoint: 'initiate',
        calldata: ['0x3', '0x4'],
      });
      // Fee call: BIM bitcoin fee on 100,000 sats, sent to treasury in WBTC
      expect(result.calls[2]).toEqual({
        contractAddress: WBTC_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: [TREASURY_ADDRESS.toString(), expectedBimFee.getSat().toString(), '0'],
      });
      expect(result.amount.getSat()).toBe(101_000n); // LP-quoted amount
      expect(result.feeAmount.getSat()).toBe(expectedBimFee.getSat());
      expect(result.swapId).toBe(SwapId.of('swap-btc-456'));
      expect(result.destinationAddress).toBe(BitcoinAddress.of(BTC_BECH32));
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws InvalidPaymentAmountError when amount is 0', async () => {
      const zeroParsed: ParsedPaymentData = {
        network: 'bitcoin',
        address: BitcoinAddress.of(BTC_BECH32),
        amount: Amount.zero(),
        description: '',
      };

      await expect(
        service.prepareCalls(zeroParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent'),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });

    it('propagates SwapAmountError from swap service', async () => {
      vi.mocked(mockSwapService.createStarknetToBitcoin).mockRejectedValue(
        new SwapAmountError(
          Amount.ofSatoshi(100_000n),
          Amount.ofSatoshi(500_000n),
          Amount.ofSatoshi(10_000_000n),
        ),
      );

      await expect(
        service.prepareCalls(bitcoinParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent'),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createStarknetToBitcoin).mockRejectedValue(
        new SwapCreationError('Service unavailable'),
      );

      await expect(
        service.prepareCalls(bitcoinParsed, SENDER_ADDRESS, ACCOUNT_ID, 'Sent'),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // PREPARE (parse + fee calculation)
  // ===========================================================================

  describe('prepare', () => {
    let service: PayService;
    let mockSwapService: SwapService;

    beforeEach(() => {
      vi.resetAllMocks();

      mockSwapService = {
        fetchLimits: vi.fn().mockResolvedValue({
          limits: {minSats: 1n, maxSats: BigInt(Number.MAX_SAFE_INTEGER), feePercent: 0.3},
        }),
      } as unknown as SwapService;

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory(feeConfig),
        starknetGateway: {} as unknown as StarknetGateway,
        swapService: mockSwapService,
        transactionRepository: createMockTransactionRepository(),
        starknetConfig: {network: 'mainnet', bitcoinNetwork: 'mainnet', rpcUrl: 'http://localhost:5050', accountClassHash: '0x123', wbtcTokenAddress: WBTC_TOKEN_ADDRESS, strkTokenAddress: STRK_TOKEN_ADDRESS, feeTreasuryAddress: TREASURY_ADDRESS},
        feeConfig,
        logger,
      });
    });

    it('applies BIM fee for starknet payments', async () => {
      const amount = Amount.ofSatoshi(100_000_000n);
      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount,
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
      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'lightning',
        invoice: LightningInvoice.of(VALID_INVOICE),
        amount,
        description: 'test',
      });

      const result = await service.prepare(VALID_INVOICE);

      // LP fee comes from mock feePercent: 0.3 (i.e. 0.3% as decimal 0.003)
      const lpFee = FeeCalculator.calculateFee(amount, 0.3 / 100);
      const bimFee = FeeCalculator.calculateFee(amount, feeConfig.percentageFor('lightning'));
      expect(result.network).toBe('lightning');
      expect(result.fee.getSat()).toBe(lpFee.getSat() + bimFee.getSat());
      expect(mockSwapService.fetchLimits).toHaveBeenCalledWith({direction: 'starknet_to_lightning'});
    });

    it('estimates LP fee + BIM fee for bitcoin payments', async () => {
      const amount = Amount.ofSatoshi(100_000n);
      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'bitcoin',
        address: BitcoinAddress.of(BTC_BECH32),
        amount,
        description: '',
      });

      const result = await service.prepare(`bitcoin:${BTC_BECH32}?amount=0.001`);

      const lpFee = FeeCalculator.calculateFee(amount, 0.3 / 100);
      const bimFee = FeeCalculator.calculateFee(amount, feeConfig.percentageFor('bitcoin'));
      expect(result.network).toBe('bitcoin');
      expect(result.fee.getSat()).toBe(lpFee.getSat() + bimFee.getSat());
      expect(mockSwapService.fetchLimits).toHaveBeenCalledWith({direction: 'starknet_to_bitcoin'});
    });
  });

  // ===========================================================================
  // SAVE PAYMENT RESULT
  // ===========================================================================

  describe('savePaymentResult', () => {
    let service: PayService;
    let mockTransactionRepository: TransactionRepository;

    beforeEach(() => {
      vi.resetAllMocks();

      mockTransactionRepository = createMockTransactionRepository();

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory(feeConfig),
        starknetGateway: {} as unknown as StarknetGateway,
        swapService: {} as unknown as SwapService,
        transactionRepository: mockTransactionRepository,
        starknetConfig: {network: 'mainnet', bitcoinNetwork: 'mainnet', rpcUrl: 'http://localhost:5050', accountClassHash: '0x123', wbtcTokenAddress: WBTC_TOKEN_ADDRESS, strkTokenAddress: STRK_TOKEN_ADDRESS, feeTreasuryAddress: TREASURY_ADDRESS},
        feeConfig,
        logger,
      });
    });

    it('saves transaction description to repository', async () => {
      await service.savePaymentResult({
        txHash: '0xabc123',
        accountId: ACCOUNT_ID,
        description: 'Payment for coffee',
      });

      expect(mockTransactionRepository.saveDescription).toHaveBeenCalledOnce();
    });
  });
});
