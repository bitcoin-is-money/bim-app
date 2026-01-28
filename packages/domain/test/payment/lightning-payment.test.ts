import {StarknetAddress} from '@bim/domain/account';
import {
  Erc20CallFactory,
  InvalidPaymentAmountError,
  LightningPaymentService,
  MissingPaymentAmountError,
} from '@bim/domain/payment';
import type {LightningDecoder, StarknetGateway} from '@bim/domain/ports';
import {Amount, ValidationError} from '@bim/domain/shared';
import {LightningInvoice, Swap, SwapAmountError, SwapCreationError, SwapId, type SwapService} from '@bim/domain/swap';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const SENDER_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const DESTINATION_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const DEPOSIT_ADDRESS = '0x05abbccdd00112233445566778899aabbccdd00112233445566778899aabbcc';
const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const TX_HASH = '0xdef456';

const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

function createMockPaySwap(): Swap {
  return Swap.createStarknetToLightning({
    id: SwapId.of('swap-123'),
    amount: Amount.ofSatoshi(50_000n),
    sourceAddress: SENDER_ADDRESS,
    invoice: LightningInvoice.of(VALID_INVOICE),
    depositAddress: DEPOSIT_ADDRESS,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
}

function createMockReceiveSwap(): Swap {
  return Swap.createLightningToStarknet({
    id: SwapId.of('recv-ln-001'),
    amount: Amount.ofSatoshi(50_000n),
    destinationAddress: DESTINATION_ADDRESS,
    invoice: VALID_INVOICE,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
}

function createMockDecoder(overrides?: Partial<ReturnType<LightningDecoder['decode']>>): LightningDecoder {
  return {
    decode: vi.fn().mockReturnValue({
      amountMSat: 50_000_000n, // 50,000 sats in mSat
      description: 'testPayment',
      expiresAt: new Date('2025-06-01T00:00:00Z'),
      ...overrides,
    }),
  };
}

describe('LightningPaymentService', () => {
  // ===========================================================================
  // PAY
  // ===========================================================================

  describe('pay', () => {
    let service: LightningPaymentService;
    let mockSwapService: SwapService;
    let mockStarknetGateway: StarknetGateway;

    beforeEach(() => {
      mockSwapService = {
        createStarknetToLightning: vi.fn().mockResolvedValue({
          swap: createMockPaySwap(),
          depositAddress: DEPOSIT_ADDRESS,
          amount: Amount.ofSatoshi(50_000n),
        }),
        createLightningToStarknet: vi.fn(),
        createBitcoinToStarknet: vi.fn(),
        createStarknetToBitcoin: vi.fn(),
        fetchStatus: vi.fn(),
        fetchLimits: vi.fn(),
        claim: vi.fn(),
      } as unknown as SwapService;

      mockStarknetGateway = {
        executeCalls: vi.fn().mockResolvedValue({txHash: TX_HASH}),
      } as unknown as StarknetGateway;

      service = new LightningPaymentService({
        swapService: mockSwapService,
        starknetGateway: mockStarknetGateway,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: new Erc20CallFactory({percentage: 0, recipientAddress: TREASURY_ADDRESS}),
        lightningDecoder: createMockDecoder(),
      });
    });

    it('creates swap then executes WBTC deposit', async () => {
      const invoice = LightningInvoice.of(VALID_INVOICE);

      await service.pay({invoice, senderAddress: SENDER_ADDRESS});

      // Step 1: create swap
      expect(mockSwapService.createStarknetToLightning).toHaveBeenCalledWith({
        invoice,
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
      const invoice = LightningInvoice.of(VALID_INVOICE);
      const result = await service.pay({invoice, senderAddress: SENDER_ADDRESS});

      expect(result.txHash).toBe(TX_HASH);
      expect(result.swapId).toBe(SwapId.of('swap-123'));
      expect(result.invoice).toBe(invoice);
      expect(result.amount.getSat()).toBe(50_000n);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('propagates SwapAmountError from swap service', async () => {
      const invoice = LightningInvoice.of(VALID_INVOICE);
      vi.mocked(mockSwapService.createStarknetToLightning).mockRejectedValue(
        new SwapAmountError(
          Amount.ofSatoshi(50_000n),
          Amount.ofSatoshi(100_000n),
          Amount.ofSatoshi(1_000_000n),
        ),
      );

      await expect(
        service.pay({invoice, senderAddress: SENDER_ADDRESS}),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      const invoice = LightningInvoice.of(VALID_INVOICE);
      vi.mocked(mockSwapService.createStarknetToLightning).mockRejectedValue(
        new SwapCreationError('Atomiq service unavailable'),
      );

      await expect(
        service.pay({invoice, senderAddress: SENDER_ADDRESS}),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // RECEIVE
  // ===========================================================================

  describe('receive', () => {
    let service: LightningPaymentService;
    let mockSwapService: SwapService;

    beforeEach(() => {
      mockSwapService = {
        createLightningToStarknet: vi.fn().mockResolvedValue({
          swap: createMockReceiveSwap(),
          invoice: VALID_INVOICE,
        }),
        createBitcoinToStarknet: vi.fn(),
        createStarknetToLightning: vi.fn(),
        createStarknetToBitcoin: vi.fn(),
        fetchStatus: vi.fn(),
        fetchLimits: vi.fn(),
        claim: vi.fn(),
      } as unknown as SwapService;

      service = new LightningPaymentService({
        swapService: mockSwapService,
        starknetGateway: {} as unknown as StarknetGateway,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
        lightningDecoder: createMockDecoder(),
      });
    });

    it('delegates to swapService.createLightningToStarknet', async () => {
      await service.receive({
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
      });

      expect(mockSwapService.createLightningToStarknet).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(50_000n),
        destinationAddress: DESTINATION_ADDRESS,
      });
    });

    it('returns swap id, invoice and expiry', async () => {
      const result = await service.receive({
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
      });

      expect(result.swapId).toBe(SwapId.of('recv-ln-001'));
      expect(result.invoice).toBe(LightningInvoice.of(VALID_INVOICE));
      expect(result.amount.getSat()).toBe(50_000n);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws InvalidPaymentAmountError when amount is 0', async () => {
      await expect(
        service.receive({
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.zero(),
        }),
      ).rejects.toThrow(InvalidPaymentAmountError);
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
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.ofSatoshi(50_000n),
        }),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createLightningToStarknet).mockRejectedValue(
        new SwapCreationError('Invoice generation failed'),
      );

      await expect(
        service.receive({
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.ofSatoshi(50_000n),
        }),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // PARSE
  // ===========================================================================

  describe('parse', () => {
    it('detects a Lightning invoice and returns decoded data', () => {
      const service = new LightningPaymentService({
        swapService: {} as any,
        starknetGateway: {} as any,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
        lightningDecoder: createMockDecoder(),
      });

      const result = service.parse(VALID_INVOICE);

      expect(result.network).toBe('lightning');
      expect(result.invoice).toBe(VALID_INVOICE);
      expect(result.amount.getSat()).toBe(50_000n);
      expect(result.description).toBe('testPayment');
      expect(result.expiresAt).toEqual(new Date('2025-06-01T00:00:00Z'));
    });

    it('throws MissingPaymentAmountError when invoice has no amount', () => {
      const service = new LightningPaymentService({
        swapService: {} as any,
        starknetGateway: {} as any,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
        lightningDecoder: createMockDecoder({amountMSat: undefined}),
      });

      expect(() => service.parse(VALID_INVOICE)).toThrow(MissingPaymentAmountError);
    });

    it('throws ValidationError when invoice has negative amount', () => {
      const service = new LightningPaymentService({
        swapService: {} as any,
        starknetGateway: {} as any,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
        lightningDecoder: createMockDecoder({amountMSat: BigInt(-1)}),
      });

      expect(() => service.parse(VALID_INVOICE)).toThrow(ValidationError);
    });
  });
});
