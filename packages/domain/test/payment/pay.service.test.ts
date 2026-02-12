import {StarknetAddress} from '@bim/domain/account';
import {Erc20CallFactory, FeeConfig, InvalidPaymentAmountError, type ParseService, PayService, SameAddressPaymentError} from '@bim/domain/payment';
import type {StarknetGateway, TransactionRepository} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {BitcoinAddress, LightningInvoice, Swap, SwapAmountError, SwapCreationError, SwapId, type SwapService} from '@bim/domain/swap';
import type {Logger} from "pino";
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createTestLogger} from '../helper';

// =============================================================================
// Constants
// =============================================================================

const ETH_TOKEN_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const SENDER_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const TX_HASH = '0xabc123';
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
  });
}

// =============================================================================
// Shared Setup
// =============================================================================

const feeConfig: FeeConfig = {
  percentage: FeeConfig.DEFAULT_PERCENTAGE,
  recipientAddress: TREASURY_ADDRESS,
};

const mockParseService = {
  parse: vi.fn(),
} as unknown as ParseService;

describe('PayService', () => {
  // ===========================================================================
  // EXECUTE — Starknet
  // ===========================================================================

  describe('execute — starknet', () => {
    let service: PayService;
    let mockStarknetGateway: StarknetGateway;
    let mockTransactionRepository: TransactionRepository;

    beforeEach(() => {
      vi.resetAllMocks();

      mockStarknetGateway = {
        executeCalls: vi.fn().mockResolvedValue({txHash: TX_HASH}),
      } as unknown as StarknetGateway;

      mockTransactionRepository = createMockTransactionRepository();

      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      });

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory(feeConfig),
        starknetGateway: mockStarknetGateway,
        swapService: {} as unknown as SwapService,
        transactionRepository: mockTransactionRepository,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        feeConfig,
        logger: createTestLogger(),
      });
    });

    it('executes a transfer via the gateway (calls executeCalls with transfer + fee calls)', async () => {
      const result = await service.execute({
        paymentPayload: 'starknet:...',
        senderAddress: SENDER_ADDRESS,
        accountId: ACCOUNT_ID,
      });

      expect(result.network).toBe('starknet');

      const callArgs = vi.mocked(mockStarknetGateway.executeCalls).mock.calls[0][0];
      expect(callArgs.senderAddress).toBe(SENDER_ADDRESS);
      expect(callArgs.calls).toHaveLength(2); // transfer + fee
      expect(callArgs.calls[0]).toEqual({
        contractAddress: ETH_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: [RECIPIENT_ADDRESS, '100000000', '0'],
      });
      expect(callArgs.calls[1].calldata[0]).toBe(TREASURY_ADDRESS.toString());
    });

    it('returns txHash, amount, feeAmount, recipientAddress, tokenAddress', async () => {
      const result = await service.execute({
        paymentPayload: 'starknet:...',
        senderAddress: SENDER_ADDRESS,
        accountId: ACCOUNT_ID,
      });

      expect(result.network).toBe('starknet');
      if (result.network !== 'starknet') return;

      expect(result.txHash).toBe(TX_HASH);
      expect(result.amount.getSat()).toBe(100_000_000n);
      expect(result.feeAmount.getSat()).toBe(100_000n); // 0.1% fee applied
      expect(result.recipientAddress).toBe(RECIPIENT_ADDRESS);
      expect(result.tokenAddress).toBe(ETH_TOKEN_ADDRESS);
    });

    it('sends only transfer call when fee rounds to zero', async () => {
      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.ofMilliSatoshi(999n),
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      });

      const result = await service.execute({
        paymentPayload: 'starknet:...',
        senderAddress: SENDER_ADDRESS,
        accountId: ACCOUNT_ID,
      });

      if (result.network !== 'starknet') return;
      expect(result.feeAmount.isZero()).toBe(true);

      const callArgs = vi.mocked(mockStarknetGateway.executeCalls).mock.calls[0][0];
      expect(callArgs.calls).toHaveLength(1);
    });

    it('throws InvalidPaymentAmountError when parsed amount is 0', async () => {
      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'starknet',
        address: RECIPIENT_ADDRESS,
        amount: Amount.zero(),
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      });

      await expect(
        service.execute({paymentPayload: 'starknet:...', senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID}),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });

    it('throws SameAddressPaymentError when sender equals recipient', async () => {
      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'starknet',
        address: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(1_000n),
        tokenAddress: ETH_TOKEN_ADDRESS,
        description: '',
      });

      await expect(
        service.execute({paymentPayload: 'starknet:...', senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID}),
      ).rejects.toThrow(SameAddressPaymentError);
    });
  });

  // ===========================================================================
  // EXECUTE — Lightning
  // ===========================================================================

  describe('execute — lightning', () => {
    let service: PayService;
    let mockSwapService: SwapService;
    let mockStarknetGateway: StarknetGateway;

    beforeEach(() => {
      vi.resetAllMocks();

      mockSwapService = {
        createStarknetToLightning: vi.fn().mockResolvedValue({
          swap: createMockLightningPaySwap(),
          depositAddress: DEPOSIT_ADDRESS,
          amount: Amount.ofSatoshi(50_000n),
        }),
      } as unknown as SwapService;

      mockStarknetGateway = {
        executeCalls: vi.fn().mockResolvedValue({txHash: TX_HASH}),
      } as unknown as StarknetGateway;

      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'lightning',
        invoice: LightningInvoice.of(VALID_INVOICE),
        amount: Amount.ofSatoshi(50_000n),
        description: 'test',
      });

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory({percentage: 0, recipientAddress: TREASURY_ADDRESS}),
        starknetGateway: mockStarknetGateway,
        swapService: mockSwapService,
        transactionRepository: createMockTransactionRepository(),
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        feeConfig,
        logger: createTestLogger(),
      });
    });

    it('creates swap then executes WBTC deposit', async () => {
      await service.execute({paymentPayload: VALID_INVOICE, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID});

      // Step 1: create swap
      expect(mockSwapService.createStarknetToLightning).toHaveBeenCalledWith({
        invoice: LightningInvoice.of(VALID_INVOICE),
        sourceAddress: SENDER_ADDRESS,
      });

      // Step 2: execute WBTC deposit to swap's deposit address
      expect(mockStarknetGateway.executeCalls).toHaveBeenCalledWith({
        senderAddress: SENDER_ADDRESS,
        calls: [
          {
            contractAddress: WBTC_TOKEN_ADDRESS,
            entrypoint: 'transfer',
            calldata: [StarknetAddress.of(DEPOSIT_ADDRESS), '50000', '0'],
          },
        ],
      });
    });

    it('returns txHash, swapId and swap details', async () => {
      const result = await service.execute({paymentPayload: VALID_INVOICE, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID});

      expect(result.network).toBe('lightning');
      if (result.network !== 'lightning') return;

      expect(result.txHash).toBe(TX_HASH);
      expect(result.swapId).toBe(SwapId.of('swap-123'));
      expect(result.invoice).toBe(LightningInvoice.of(VALID_INVOICE));
      expect(result.amount.getSat()).toBe(50_000n);
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
        service.execute({paymentPayload: VALID_INVOICE, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID}),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createStarknetToLightning).mockRejectedValue(
        new SwapCreationError('Atomiq service unavailable'),
      );

      await expect(
        service.execute({paymentPayload: VALID_INVOICE, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID}),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // EXECUTE — Bitcoin
  // ===========================================================================

  describe('execute — bitcoin', () => {
    let service: PayService;
    let mockSwapService: SwapService;
    let mockStarknetGateway: StarknetGateway;

    beforeEach(() => {
      vi.resetAllMocks();

      mockSwapService = {
        createStarknetToBitcoin: vi.fn().mockResolvedValue({
          swap: createMockBitcoinPaySwap(),
          depositAddress: DEPOSIT_ADDRESS,
        }),
      } as unknown as SwapService;

      mockStarknetGateway = {
        executeCalls: vi.fn().mockResolvedValue({txHash: TX_HASH}),
      } as unknown as StarknetGateway;

      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'bitcoin',
        address: BitcoinAddress.of(BTC_BECH32),
        amount: Amount.ofSatoshi(100_000n),
        description: '',
      });

      service = new PayService({
        parseService: mockParseService,
        erc20CallFactory: new Erc20CallFactory({percentage: 0, recipientAddress: TREASURY_ADDRESS}),
        starknetGateway: mockStarknetGateway,
        swapService: mockSwapService,
        transactionRepository: createMockTransactionRepository(),
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        feeConfig,
        logger: createTestLogger(),
      });
    });

    it('creates swap then executes WBTC deposit', async () => {
      await service.execute({paymentPayload: `bitcoin:${BTC_BECH32}?amount=0.001`, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID});

      // Step 1: create swap
      expect(mockSwapService.createStarknetToBitcoin).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(100_000n),
        destinationAddress: BitcoinAddress.of(BTC_BECH32),
        sourceAddress: SENDER_ADDRESS,
      });

      // Step 2: execute WBTC deposit
      expect(mockStarknetGateway.executeCalls).toHaveBeenCalledWith({
        senderAddress: SENDER_ADDRESS,
        calls: [
          {
            contractAddress: WBTC_TOKEN_ADDRESS,
            entrypoint: 'transfer',
            calldata: [StarknetAddress.of(DEPOSIT_ADDRESS), '100000', '0'],
          },
        ],
      });
    });

    it('returns txHash, swapId and payment details', async () => {
      const result = await service.execute({
        paymentPayload: `bitcoin:${BTC_BECH32}?amount=0.001`,
        senderAddress: SENDER_ADDRESS,
        accountId: ACCOUNT_ID,
      });

      expect(result.network).toBe('bitcoin');
      if (result.network !== 'bitcoin') return;

      expect(result.txHash).toBe(TX_HASH);
      expect(result.swapId).toBe(SwapId.of('swap-btc-456'));
      expect(result.amount.getSat()).toBe(100_000n);
      expect(result.destinationAddress).toBe(BitcoinAddress.of(BTC_BECH32));
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws InvalidPaymentAmountError when amount is 0', async () => {
      vi.mocked(mockParseService.parse).mockReturnValue({
        network: 'bitcoin',
        address: BitcoinAddress.of(BTC_BECH32),
        amount: Amount.zero(),
        description: '',
      });

      await expect(
        service.execute({paymentPayload: `bitcoin:${BTC_BECH32}?amount=0`, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID}),
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
        service.execute({paymentPayload: `bitcoin:${BTC_BECH32}?amount=0.001`, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID}),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createStarknetToBitcoin).mockRejectedValue(
        new SwapCreationError('Service unavailable'),
      );

      await expect(
        service.execute({paymentPayload: `bitcoin:${BTC_BECH32}?amount=0.001`, senderAddress: SENDER_ADDRESS, accountId: ACCOUNT_ID}),
      ).rejects.toThrow(SwapCreationError);
    });
  });
});
