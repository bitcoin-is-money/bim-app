import {StarknetAddress} from '@bim/domain/account';
import {InvalidPaymentAmountError, ReceiveService} from '@bim/domain/payment';
import type {StarknetCall} from '@bim/domain/ports';
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

const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const ETH_TOKEN_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const SENDER_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const DESTINATION_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const ACCOUNT_ID = 'account-001';
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';
const BTC_DEPOSIT_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const MOCK_COMMIT_CALLS: StarknetCall[] = [
  {contractAddress: '0xabc', entrypoint: 'approve', calldata: ['0x1', '0x2']},
];

// =============================================================================
// Mock swap factories
// =============================================================================

function createMockLightningReceiveSwap(): Swap {
  return Swap.createLightningToStarknet({
    id: SwapId.of('recv-ln-001'),
    amount: Amount.ofSatoshi(50_000n),
    destinationAddress: DESTINATION_ADDRESS,
    invoice: VALID_INVOICE,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    description: 'Received',
    accountId: ACCOUNT_ID,
  });
}

function createMockBitcoinReceiveSwap(): Swap {
  return Swap.createBitcoinToStarknet({
    id: SwapId.of('recv-btc-002'),
    amount: Amount.ofSatoshi(200_000n),
    destinationAddress: DESTINATION_ADDRESS,
    depositAddress: BTC_DEPOSIT_ADDRESS,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    description: 'Received',
    accountId: ACCOUNT_ID,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('ReceiveService', () => {
  let service: ReceiveService;
  let mockSwapService: SwapService;

  beforeEach(() => {
    mockSwapService = {
      createLightningToStarknet: vi.fn().mockResolvedValue({
        swap: createMockLightningReceiveSwap(),
        invoice: VALID_INVOICE,
      }),
      prepareBitcoinToStarknet: vi.fn().mockResolvedValue({
        swapId: 'recv-btc-002',
        commitCalls: MOCK_COMMIT_CALLS,
        amount: Amount.ofSatoshi(200_000n),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
      completeBitcoinToStarknet: vi.fn().mockResolvedValue({
        swap: createMockBitcoinReceiveSwap(),
        depositAddress: BTC_DEPOSIT_ADDRESS,
        bip21Uri: `bitcoin:${BTC_DEPOSIT_ADDRESS}?amount=0.002`,
      }),
      createStarknetToLightning: vi.fn(),
      createStarknetToBitcoin: vi.fn(),
      fetchStatus: vi.fn(),
      fetchLimits: vi.fn(),
      claim: vi.fn(),
    } as unknown as SwapService;

    service = new ReceiveService({
      swapService: mockSwapService,
      starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS, strkTokenAddress: STRK_TOKEN_ADDRESS},
      logger: logger,
    });
  });

  // ===========================================================================
  // Amount validation
  // ===========================================================================

  describe('amount validation', () => {
    it('throws InvalidPaymentAmountError when amount is 0', async () => {
      await expect(
        service.receive({
          network: 'lightning',
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.zero(),
          accountId: ACCOUNT_ID,
          description: undefined,
          useUriPrefix: true,
        }),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });

    it('throws InvalidPaymentAmountError when amount is undefined', async () => {
      await expect(
        service.receive({
          network: 'lightning',
          destinationAddress: DESTINATION_ADDRESS,
          accountId: ACCOUNT_ID,
          description: undefined,
          useUriPrefix: true,
        }),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });
  });

  // ===========================================================================
  // Starknet receive
  // ===========================================================================

  describe('receive — starknet', () => {
    it('returns the address and a URI with amount and default WBTC token', async () => {
      const result = await service.receive({
        network: 'starknet',
        destinationAddress: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      expect(result.network).toBe('starknet');
      if (result.network !== 'starknet') throw new Error('Expected starknet result');
      expect(result.address).toBe(SENDER_ADDRESS);
      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}?amount=50000&token=${WBTC_TOKEN_ADDRESS}`);
    });

    it('uses the provided token address when specified', async () => {
      const result = await service.receive({
        network: 'starknet',
        destinationAddress: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(1_000n),
        tokenAddress: ETH_TOKEN_ADDRESS,
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      if (result.network !== 'starknet') throw new Error('Expected starknet result');
      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}?amount=1000&token=${ETH_TOKEN_ADDRESS}`);
    });

    it('omits the starknet: prefix when useUriPrefix is false', async () => {
      const result = await service.receive({
        network: 'starknet',
        destinationAddress: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: false,
      });

      if (result.network !== 'starknet') throw new Error('Expected starknet result');
      expect(result.uri).toBe(`${SENDER_ADDRESS}?amount=50000&token=${WBTC_TOKEN_ADDRESS}`);
    });

    it('includes the starknet: prefix when useUriPrefix is true', async () => {
      const result = await service.receive({
        network: 'starknet',
        destinationAddress: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      if (result.network !== 'starknet') throw new Error('Expected starknet result');
      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}?amount=50000&token=${WBTC_TOKEN_ADDRESS}`);
    });

    it('returns address-only URI when amount is omitted', async () => {
      const result = await service.receive({
        network: 'starknet',
        destinationAddress: SENDER_ADDRESS,
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      if (result.network !== 'starknet') throw new Error('Expected starknet result');
      expect(result.address).toBe(SENDER_ADDRESS);
      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}`);
    });

    it('returns address-only URI when amount is zero', async () => {
      const result = await service.receive({
        network: 'starknet',
        destinationAddress: SENDER_ADDRESS,
        amount: Amount.zero(),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      if (result.network !== 'starknet') throw new Error('Expected starknet result');
      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}`);
    });
  });

  // ===========================================================================
  // Lightning receive
  // ===========================================================================

  describe('receive — lightning', () => {
    it('delegates to swapService.createLightningToStarknet', async () => {
      await service.receive({
        network: 'lightning',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      expect(mockSwapService.createLightningToStarknet).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(50_000n),
        destinationAddress: DESTINATION_ADDRESS,
        accountId: ACCOUNT_ID,
        description: 'Received',
      });
    });

    it('returns swap id, invoice and expiry', async () => {
      const result = await service.receive({
        network: 'lightning',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      expect(result.network).toBe('lightning');
      if (result.network !== 'lightning') throw new Error('Expected lightning result');
      expect(result.swapId).toBe(SwapId.of('recv-ln-001'));
      expect(result.invoice).toBe(LightningInvoice.of(VALID_INVOICE));
      expect(result.amount.getSat()).toBe(50_000n);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('propagates SwapAmountError from swap service', async () => {
      vi.mocked(mockSwapService.createLightningToStarknet).mockRejectedValue(
        new SwapAmountError(
          Amount.ofSatoshi(50_000n),
          Amount.ofSatoshi(100_000n),
          Amount.ofSatoshi(1_000_000n),
        ),
      );

      await expect(
        service.receive({
          network: 'lightning',
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.ofSatoshi(50_000n),
          accountId: ACCOUNT_ID,
          description: undefined,
          useUriPrefix: true,
        }),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createLightningToStarknet).mockRejectedValue(
        new SwapCreationError('Invoice generation failed'),
      );

      await expect(
        service.receive({
          network: 'lightning',
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.ofSatoshi(50_000n),
          accountId: ACCOUNT_ID,
          description: undefined,
          useUriPrefix: true,
        }),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // Bitcoin receive — Phase 1 (prepare)
  // ===========================================================================

  describe('receive — bitcoin (prepare)', () => {
    it('delegates to swapService.prepareBitcoinToStarknet', async () => {
      await service.receive({
        network: 'bitcoin',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      expect(mockSwapService.prepareBitcoinToStarknet).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(200_000n),
        destinationAddress: DESTINATION_ADDRESS,
        accountId: ACCOUNT_ID,
        description: 'Received',
      });
    });

    it('returns pending_commit status with swap id, commit calls and expiry', async () => {
      const result = await service.receive({
        network: 'bitcoin',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
        accountId: ACCOUNT_ID,
        description: undefined,
        useUriPrefix: true,
      });

      expect(result.network).toBe('bitcoin');
      if (result.network !== 'bitcoin') throw new Error('Expected bitcoin result');
      expect('status' in result && result.status).toBe('pending_commit');
      if (!('status' in result) || result.status !== 'pending_commit') throw new Error('Expected pending_commit');
      expect(result.swapId).toBe('recv-btc-002');
      expect(result.commitCalls).toEqual(MOCK_COMMIT_CALLS);
      expect(result.amount.getSat()).toBe(200_000n);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.prepareBitcoinToStarknet).mockRejectedValue(
        new SwapCreationError('Swap preparation failed'),
      );

      await expect(
        service.receive({
          network: 'bitcoin',
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.ofSatoshi(200_000n),
          accountId: ACCOUNT_ID,
          description: undefined,
          useUriPrefix: true,
        }),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // Bitcoin receive — Phase 2 (complete)
  // ===========================================================================

  describe('completeBitcoinReceive', () => {
    it('delegates to swapService.completeBitcoinToStarknet and returns deposit address', async () => {
      const result = await service.completeBitcoinReceive({
        swapId: 'recv-btc-002',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
        description: 'Received',
        accountId: 'account-001',
        useUriPrefix: true,
      });

      expect(mockSwapService.completeBitcoinToStarknet).toHaveBeenCalledWith({
        swapId: 'recv-btc-002',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
        description: 'Received',
        accountId: 'account-001',
      });

      expect(result.network).toBe('bitcoin');
      expect(result.swapId).toBe(SwapId.of('recv-btc-002'));
      expect(result.depositAddress).toBe(BitcoinAddress.of(BTC_DEPOSIT_ADDRESS));
      expect(result.bip21Uri).toBe(`bitcoin:${BTC_DEPOSIT_ADDRESS}?amount=0.002`);
      expect(result.amount.getSat()).toBe(200_000n);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('omits the bitcoin: prefix when useUriPrefix is false', async () => {
      const result = await service.completeBitcoinReceive({
        swapId: 'recv-btc-002',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
        description: 'Received',
        accountId: 'account-001',
        useUriPrefix: false,
      });

      expect(result.bip21Uri).toBe(`${BTC_DEPOSIT_ADDRESS}?amount=0.002`);
    });

    it('includes the bitcoin: prefix when useUriPrefix is true', async () => {
      const result = await service.completeBitcoinReceive({
        swapId: 'recv-btc-002',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
        description: 'Received',
        accountId: 'account-001',
        useUriPrefix: true,
      });

      expect(result.bip21Uri).toBe(`bitcoin:${BTC_DEPOSIT_ADDRESS}?amount=0.002`);
    });

    it('propagates errors from swap service', async () => {
      vi.mocked(mockSwapService.completeBitcoinToStarknet).mockRejectedValue(
        new SwapCreationError('Failed to retrieve deposit address'),
      );

      await expect(
        service.completeBitcoinReceive({
          swapId: 'recv-btc-002',
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.ofSatoshi(200_000n),
          description: 'Received',
          accountId: 'account-001',
          useUriPrefix: true,
        }),
      ).rejects.toThrow(SwapCreationError);
    });
  });
});
