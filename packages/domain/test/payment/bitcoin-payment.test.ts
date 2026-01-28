import {StarknetAddress} from '@bim/domain/account';
import {
  BitcoinPaymentService,
  Erc20CallFactory,
  InvalidPaymentAddressError,
  InvalidPaymentAmountError,
  MissingPaymentAmountError,
} from '@bim/domain/payment';
import type {StarknetGateway} from '@bim/domain/ports';
import {Amount, ValidationError} from '@bim/domain/shared';
import {
  BitcoinAddress,
  InvalidBitcoinAddressError,
  Swap,
  SwapAmountError,
  SwapCreationError,
  SwapId,
  type SwapService
} from '@bim/domain/swap';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const SENDER_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const DESTINATION_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const DEPOSIT_ADDRESS = '0x05abbccdd00112233445566778899aabbccdd00112233445566778899aabbcc';
const BTC_ADDRESS = BitcoinAddress.of('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
const BTC_DEPOSIT_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const TX_HASH = '0xbtc789';

function createMockPaySwap(): Swap {
  return Swap.createStarknetToBitcoin({
    id: SwapId.of('swap-btc-456'),
    amount: Amount.ofSatoshi(100_000n),
    sourceAddress: SENDER_ADDRESS,
    destinationAddress: BTC_ADDRESS,
    depositAddress: DEPOSIT_ADDRESS,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
}

function createMockReceiveSwap(): Swap {
  return Swap.createBitcoinToStarknet({
    id: SwapId.of('recv-btc-002'),
    amount: Amount.ofSatoshi(200_000n),
    destinationAddress: DESTINATION_ADDRESS,
    depositAddress: BTC_DEPOSIT_ADDRESS,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
}

describe('BitcoinPaymentService', () => {
  // ===========================================================================
  // PAY
  // ===========================================================================

  describe('pay', () => {
    let service: BitcoinPaymentService;
    let mockSwapService: SwapService;
    let mockStarknetGateway: StarknetGateway;

    beforeEach(() => {
      mockSwapService = {
        createStarknetToBitcoin: vi.fn().mockResolvedValue({
          swap: createMockPaySwap(),
          depositAddress: DEPOSIT_ADDRESS,
        }),
        createStarknetToLightning: vi.fn(),
        createLightningToStarknet: vi.fn(),
        createBitcoinToStarknet: vi.fn(),
        fetchStatus: vi.fn(),
        fetchLimits: vi.fn(),
        claim: vi.fn(),
      } as unknown as SwapService;

      mockStarknetGateway = {
        executeCalls: vi.fn().mockResolvedValue({txHash: TX_HASH}),
      } as unknown as StarknetGateway;

      service = new BitcoinPaymentService({
        swapService: mockSwapService,
        starknetGateway: mockStarknetGateway,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: new Erc20CallFactory({percentage: 0, recipientAddress: TREASURY_ADDRESS}),
      });
    });

    it('creates swap then executes WBTC deposit', async () => {
      await service.pay({
        address: BTC_ADDRESS,
        amount: Amount.ofSatoshi(100_000n),
        senderAddress: SENDER_ADDRESS,
      });

      // Step 1: create swap
      expect(mockSwapService.createStarknetToBitcoin).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(100_000n),
        destinationAddress: BTC_ADDRESS,
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
      const result = await service.pay({
        address: BTC_ADDRESS,
        amount: Amount.ofSatoshi(100_000n),
        senderAddress: SENDER_ADDRESS,
      });

      expect(result.txHash).toBe(TX_HASH);
      expect(result.swapId).toBe(SwapId.of('swap-btc-456'));
      expect(result.amount.getSat()).toBe(100_000n);
      expect(result.destinationAddress).toBe(BTC_ADDRESS);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws InvalidPaymentAmountError when amount is 0', async () => {
      await expect(
        service.pay({
          address: BTC_ADDRESS,
          amount: Amount.zero(),
          senderAddress: SENDER_ADDRESS,
        }),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });

    it('does not call gateway when validation fails', async () => {
      await expect(
        service.pay({
          address: BTC_ADDRESS,
          amount: Amount.zero(),
          senderAddress: SENDER_ADDRESS,
        }),
      ).rejects.toThrow();

      expect(mockStarknetGateway.executeCalls).not.toHaveBeenCalled();
      expect(mockSwapService.createStarknetToBitcoin).not.toHaveBeenCalled();
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
        service.pay({
          address: BTC_ADDRESS,
          amount: Amount.ofSatoshi(100_000n),
          senderAddress: SENDER_ADDRESS,
        }),
      ).rejects.toThrow(SwapAmountError);
    });

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createStarknetToBitcoin).mockRejectedValue(
        new SwapCreationError('Service unavailable'),
      );

      await expect(
        service.pay({
          address: BTC_ADDRESS,
          amount: Amount.ofSatoshi(100_000n),
          senderAddress: SENDER_ADDRESS,
        }),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // RECEIVE
  // ===========================================================================

  describe('receive', () => {
    let service: BitcoinPaymentService;
    let mockSwapService: SwapService;

    beforeEach(() => {
      mockSwapService = {
        createBitcoinToStarknet: vi.fn().mockResolvedValue({
          swap: createMockReceiveSwap(),
          depositAddress: BTC_DEPOSIT_ADDRESS,
          bip21Uri: `bitcoin:${BTC_DEPOSIT_ADDRESS}?amount=0.002`,
        }),
        createLightningToStarknet: vi.fn(),
        createStarknetToLightning: vi.fn(),
        createStarknetToBitcoin: vi.fn(),
        fetchStatus: vi.fn(),
        fetchLimits: vi.fn(),
        claim: vi.fn(),
      } as unknown as SwapService;

      service = new BitcoinPaymentService({
        swapService: mockSwapService,
        starknetGateway: {} as unknown as StarknetGateway,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
      });
    });

    it('delegates to swapService.createBitcoinToStarknet', async () => {
      await service.receive({
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
      });

      expect(mockSwapService.createBitcoinToStarknet).toHaveBeenCalledWith({
        amount: Amount.ofSatoshi(200_000n),
        destinationAddress: DESTINATION_ADDRESS,
      });
    });

    it('returns swap id, deposit address, bip21 URI and expiry', async () => {
      const result = await service.receive({
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(200_000n),
      });

      expect(result.swapId).toBe(SwapId.of('recv-btc-002'));
      expect(result.depositAddress).toBe(BitcoinAddress.of(BTC_DEPOSIT_ADDRESS));
      expect(result.bip21Uri).toBe(`bitcoin:${BTC_DEPOSIT_ADDRESS}?amount=0.002`);
      expect(result.amount.getSat()).toBe(200_000n);
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

    it('propagates SwapCreationError from swap service', async () => {
      vi.mocked(mockSwapService.createBitcoinToStarknet).mockRejectedValue(
        new SwapCreationError('Deposit address generation failed'),
      );

      await expect(
        service.receive({
          destinationAddress: DESTINATION_ADDRESS,
          amount: Amount.ofSatoshi(200_000n),
        }),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // ===========================================================================
  // PARSE
  // ===========================================================================

  describe('parse', () => {
    const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    let service: BitcoinPaymentService;

    beforeEach(() => {
      service = new BitcoinPaymentService({
        swapService: {} as any,
        starknetGateway: {} as any,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
      });
    });

    it('parses bitcoin: URI with amount', () => {
      const result = service.parse(`bitcoin:${BTC_BECH32}?amount=0.001`);

      expect(result.network).toBe('bitcoin');
      expect(result.address).toBe(BTC_BECH32);
      expect(result.amount.getSat()).toBe(100_000n);
      expect(result.description).toBe('');
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
      expect(() => service.parse(`bitcoin:${BTC_BECH32}`)).toThrow(MissingPaymentAmountError);
    });

    it('throws ValidationError when bitcoin amount is negative', () => {
      expect(() => service.parse(`bitcoin:${BTC_BECH32}?amount=-0.001`)).toThrow(ValidationError);
    });

    it('throws InvalidPaymentAddressError for bitcoin: URI with invalid address', () => {
      expect(() => service.parse('bitcoin:not-a-valid-address')).toThrow(InvalidBitcoinAddressError);
    });
  });
});
