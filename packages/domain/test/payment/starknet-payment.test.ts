import {InvalidStarknetAddressError, StarknetAddress} from '@bim/domain/account';
import {
  Erc20CallFactory,
  FeeConfig,
  InvalidPaymentAmountError,
  InvalidPaymentAddressError,
  MissingPaymentAmountError,
  SameAddressPaymentError,
  StarknetPaymentService,
  UnsupportedTokenError,
} from '@bim/domain/payment';
import type {StarknetGateway} from '@bim/domain/ports';
import {Amount, ValidationError} from '@bim/domain/shared';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const ETH_TOKEN_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
const SENDER_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const RECIPIENT_ADDRESS = StarknetAddress.of('0x07edcba9876543210fedcba9876543210fedcba9876543210fedcba987654321');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');

const TX_HASH = '0xabc123';
const STARKNET_ADDR = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

const feeConfig: FeeConfig = {
  percentage: FeeConfig.DEFAULT_PERCENTAGE,
  recipientAddress: TREASURY_ADDRESS,
};

describe('StarknetPaymentService', () => {
  // ===========================================================================
  // PAY
  // ===========================================================================

  describe('pay', () => {
    let service: StarknetPaymentService;
    let mockStarknetGateway: StarknetGateway;

    beforeEach(() => {
      mockStarknetGateway = {
        executeCalls: vi.fn().mockResolvedValue({txHash: TX_HASH}),
        calculateAccountAddress: vi.fn(),
        buildDeployTransaction: vi.fn(),
        waitForTransaction: vi.fn(),
        getNonce: vi.fn(),
        getBalance: vi.fn(),
        estimateFee: vi.fn(),
      } as unknown as StarknetGateway;

      service = new StarknetPaymentService({
        starknetGateway: mockStarknetGateway,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: new Erc20CallFactory(feeConfig),
      });
    });

    it('executes a transfer via the gateway', async () => {
      const result = await service.pay({
        senderAddress: SENDER_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        tokenAddress: ETH_TOKEN_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
      });

      expect(result.txHash).toBe(TX_HASH);
      expect(result.amount.getSat()).toBe(100_000_000n);
      expect(result.feeAmount.getSat()).toBe(100_000n); // 0.1% fee applied
      expect(result.recipientAddress).toBe(RECIPIENT_ADDRESS);
      expect(result.tokenAddress).toBe(ETH_TOKEN_ADDRESS);
    });

    it('calls executeCalls with transfer + fee calls', async () => {
      await service.pay({
        senderAddress: SENDER_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        tokenAddress: ETH_TOKEN_ADDRESS,
        amount: Amount.ofSatoshi(500_000n),
      });

      const callArgs = vi.mocked(mockStarknetGateway.executeCalls).mock.calls[0][0];
      expect(callArgs.senderAddress).toBe(SENDER_ADDRESS);
      expect(callArgs.calls).toHaveLength(2); // transfer + fee
      expect(callArgs.calls[0]).toEqual({
        contractAddress: ETH_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: [RECIPIENT_ADDRESS, '500000', '0'],
      });
      expect(callArgs.calls[1].calldata[0]).toBe(TREASURY_ADDRESS.toString());
    });

    it('sends only transfer call when fee rounds to zero', async () => {
      // Amount so small that 0.1% rounds to 0
      const result = await service.pay({
        senderAddress: SENDER_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        tokenAddress: ETH_TOKEN_ADDRESS,
        amount: Amount.ofMilliSatoshi(999n),
      });

      expect(result.feeAmount.isZero()).toBe(true);
      const callArgs = vi.mocked(mockStarknetGateway.executeCalls).mock.calls[0][0];
      expect(callArgs.calls).toHaveLength(1);
    });

    it('throws InvalidPaymentAmountError when amount is 0', async () => {
      expect(
        service.pay({
          senderAddress: SENDER_ADDRESS,
          recipientAddress: RECIPIENT_ADDRESS,
          tokenAddress: ETH_TOKEN_ADDRESS,
          amount: Amount.zero(),
        }),
      ).rejects.toThrow(InvalidPaymentAmountError);
    });

    it('throws SameAddressPaymentError when sender equals recipient', async () => {
      expect(
        service.pay({
          senderAddress: SENDER_ADDRESS,
          recipientAddress: SENDER_ADDRESS,
          tokenAddress: ETH_TOKEN_ADDRESS,
          amount: Amount.ofSatoshi(1_000n),
        }),
      ).rejects.toThrow(SameAddressPaymentError);
    });

    it('does not call gateway when validation fails', async () => {
      expect(
        service.pay({
          senderAddress: SENDER_ADDRESS,
          recipientAddress: SENDER_ADDRESS,
          tokenAddress: ETH_TOKEN_ADDRESS,
          amount: Amount.ofSatoshi(1_000n),
        }),
      ).rejects.toThrow();

      expect(mockStarknetGateway.executeCalls).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // RECEIVE
  // ===========================================================================

  describe('receive', () => {
    let service: StarknetPaymentService;

    beforeEach(() => {
      service = new StarknetPaymentService({
        starknetGateway: {} as unknown as StarknetGateway,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
      });
    });

    it('returns the address and a bare URI when no amount is provided', () => {
      const result = service.receive({
        starknetAddress: SENDER_ADDRESS,
      });

      expect(result.address).toBe(SENDER_ADDRESS);
      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}`);
    });

    it('returns a URI with amount and default WBTC token when amount is provided', () => {
      const result = service.receive({
        starknetAddress: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(50_000n),
      });

      expect(result.address).toBe(SENDER_ADDRESS);
      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}?amount=50000&token=${WBTC_TOKEN_ADDRESS}`);
    });

    it('uses the provided token address when specified', () => {
      const result = service.receive({
        starknetAddress: SENDER_ADDRESS,
        amount: Amount.ofSatoshi(1_000n),
        tokenAddress: ETH_TOKEN_ADDRESS,
      });

      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}?amount=1000&token=${ETH_TOKEN_ADDRESS}`);
    });

    it('ignores token address when no amount is provided', () => {
      const result = service.receive({
        starknetAddress: SENDER_ADDRESS,
        tokenAddress: ETH_TOKEN_ADDRESS,
      });

      expect(result.uri).toBe(`starknet:${SENDER_ADDRESS}`);
    });
  });

  // ===========================================================================
  // PARSE
  // ===========================================================================

  describe('parse', () => {
    let service: StarknetPaymentService;

    beforeEach(() => {
      service = new StarknetPaymentService({
        starknetGateway: {} as unknown as StarknetGateway,
        starknetConfig: {wbtcTokenAddress: WBTC_TOKEN_ADDRESS},
        erc20CallFactory: {} as any,
      });
    });

    it('parses starknet: URI with amount and WBTC token', () => {
      const uri = `starknet:${RECIPIENT_ADDRESS}?amount=1000000&token=${WBTC_TOKEN_ADDRESS}`;
      const result = service.parse(uri);

      expect(result.network).toBe('starknet');
      expect(result.address).toBe(RECIPIENT_ADDRESS);
      expect(result.amount.getSat()).toBe(1_000_000n);
      expect(result.tokenAddress).toBe(WBTC_TOKEN_ADDRESS);
      expect(result.description).toBe('');
    });

    it('parses starknet: URI with short address', () => {
      const result = service.parse(`starknet:0x1234?amount=100&token=${WBTC_TOKEN_ADDRESS}`);

      expect(result.network).toBe('starknet');
      expect(result.address).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000001234',
      );
      expect(result.amount.getSat()).toBe(100n);
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
      expect(() => service.parse(`starknet:${STARKNET_ADDR}`)).toThrow(MissingPaymentAmountError);
    });

    it('throws UnsupportedTokenError when token is absent', () => {
      expect(() => service.parse(`starknet:${STARKNET_ADDR}?amount=1000`)).toThrow(UnsupportedTokenError);
    });

    it('throws UnsupportedTokenError for unsupported token', () => {
      const unknownToken = '0x0000000000000000000000000000000000000000000000000000000000abcdef';
      const uri = `starknet:${STARKNET_ADDR}?amount=1000&token=${unknownToken}`;
      expect(() => service.parse(uri)).toThrow(UnsupportedTokenError);
    });

    it('throws ValidationError when starknet amount is negative', () => {
      const uri = `starknet:${STARKNET_ADDR}?amount=-100&token=${WBTC_TOKEN_ADDRESS}`;
      expect(() => service.parse(uri)).toThrow(ValidationError);
    });

    it('throws InvalidPaymentAddressError for starknet: URI with invalid address', () => {
      expect(() => service.parse('starknet:not-hex?amount=1000')).toThrow(InvalidStarknetAddressError);
    });
  });
});
