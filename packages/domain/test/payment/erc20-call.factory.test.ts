import {StarknetAddress} from '@bim/domain/account';
import type {FeeConfig} from '@bim/domain/payment';
import {Erc20CallFactory} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {describe, expect, it} from 'vitest';

const ETH_TOKEN_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const RECIPIENT_ADDRESS = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');

const feeConfig: FeeConfig = {
  percentage: 0.001, // 0.1%
  recipientAddress: TREASURY_ADDRESS,
};

describe('Erc20CallFactory', () => {
  const factory = new Erc20CallFactory(feeConfig);

  describe('createTransfer without fee', () => {
    it('creates a valid transfer call structure', () => {
      const {calls} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        applyFee: false,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]!.contractAddress).toBe(ETH_TOKEN_ADDRESS);
      expect(calls[0]!.entrypoint).toBe('transfer');
      expect(calls[0]!.calldata).toHaveLength(3);
    });

    it('encodes recipient address correctly', () => {
      const {calls} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(1000n),
        applyFee: false,
      });

      expect(calls[0]!.calldata[0]).toBe(RECIPIENT_ADDRESS);
    });

    it('encodes amount as u256 (low, high)', () => {
      const {calls} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(123_456_789n),
        applyFee: false,
      });

      expect(calls[0]!.calldata[1]).toBe('123456789'); // low part as decimal string (sats)
      expect(calls[0]!.calldata[2]).toBe('0'); // high part always 0 for normal amounts
    });

    it('handles zero amount', () => {
      const {calls} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.zero(),
        applyFee: false,
      });

      expect(calls[0]!.calldata[1]).toBe('0');
      expect(calls[0]!.calldata[2]).toBe('0');
    });

    it('returns zero feeAmount', () => {
      const {feeAmount} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        applyFee: false,
      });

      expect(feeAmount.isZero()).toBe(true);
    });
  });

  describe('createTransfer with fee', () => {
    it('creates transfer call and fee call', () => {
      const amount = Amount.ofSatoshi(100_000_000n); // 1 BTC

      const {calls, feeAmount} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount,
        applyFee: true,
      });

      expect(calls).toHaveLength(2);
      expect(feeAmount.getSat()).toBe(100_000n); // 0.001 BTC
    });

    it('transfer call sends to recipient', () => {
      const {calls} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        applyFee: true,
      });

      expect(calls[0]!.calldata[0]).toBe(RECIPIENT_ADDRESS);
      expect(calls[0]!.calldata[1]).toBe('100000000');
    });

    it('fee call sends to treasury', () => {
      const {calls} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        applyFee: true,
      });

      expect(calls[1]!.calldata[0]).toBe(TREASURY_ADDRESS.toString());
      expect(calls[1]!.calldata[1]).toBe('100000'); // 0.1% of 100,000,000 sats
    });

    it('returns only transfer call when amount too small for fee', () => {
      // 999 mSat * 0.001 = <1 mSat, rounds down to 0
      const {calls, feeAmount} = factory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofMilliSatoshi(999n),
        applyFee: true,
      });

      expect(feeAmount.isZero()).toBe(true);
      expect(calls).toHaveLength(1);
    });

    it('uses correct token address for both calls', () => {
      const customToken = '0xcustom_token_address';

      const {calls} = factory.createTransfer({
        tokenAddress: customToken,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        applyFee: true,
      });

      expect(calls[0]!.contractAddress).toBe(customToken);
      expect(calls[1]!.contractAddress).toBe(customToken);
    });

    it('calculates fee correctly for various amounts', () => {
      const testCases = [
        {amount: Amount.ofSatoshi(100_000_000n), expectedFeeSats: 100_000n},
        {amount: Amount.ofSatoshi(1_000_000_000n), expectedFeeSats: 1_000_000n},
        {amount: Amount.ofSatoshi(10_000_000n), expectedFeeSats: 10_000n},
      ];

      for (const {amount, expectedFeeSats} of testCases) {
        const {feeAmount} = factory.createTransfer({
          tokenAddress: ETH_TOKEN_ADDRESS,
          recipientAddress: RECIPIENT_ADDRESS,
          amount,
          applyFee: true,
        });

        expect(feeAmount.getSat()).toBe(expectedFeeSats);
      }
    });
  });

  describe('createFeeCall', () => {
    const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';

    it('creates a fee-only call to treasury', () => {
      const {calls, feeAmount} = factory.createFeeCall(
        WBTC_TOKEN_ADDRESS,
        Amount.ofSatoshi(100_000_000n),
      );

      expect(calls).toHaveLength(1);
      expect(feeAmount.getSat()).toBe(100_000n); // 0.1% of 100M sats
      expect(calls[0]!.contractAddress).toBe(WBTC_TOKEN_ADDRESS);
      expect(calls[0]!.entrypoint).toBe('transfer');
      expect(calls[0]!.calldata[0]).toBe(TREASURY_ADDRESS.toString());
      expect(calls[0]!.calldata[1]).toBe('100000');
      expect(calls[0]!.calldata[2]).toBe('0');
    });

    it('returns empty calls when amount too small for fee', () => {
      const {calls, feeAmount} = factory.createFeeCall(
        WBTC_TOKEN_ADDRESS,
        Amount.ofMilliSatoshi(999n),
      );

      expect(calls).toHaveLength(0);
      expect(feeAmount.isZero()).toBe(true);
    });

    it('returns empty calls with zero-fee config', () => {
      const zeroFactory = new Erc20CallFactory({
        percentage: 0,
        recipientAddress: TREASURY_ADDRESS,
      });

      const {calls, feeAmount} = zeroFactory.createFeeCall(
        WBTC_TOKEN_ADDRESS,
        Amount.ofSatoshi(100_000_000n),
      );

      expect(calls).toHaveLength(0);
      expect(feeAmount.isZero()).toBe(true);
    });
  });

  describe('with zero-fee config', () => {
    const zeroFeeFactory = new Erc20CallFactory({
      percentage: 0,
      recipientAddress: TREASURY_ADDRESS,
    });

    it('returns only transfer call even with applyFee: true', () => {
      const {calls, feeAmount} = zeroFeeFactory.createTransfer({
        tokenAddress: ETH_TOKEN_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        amount: Amount.ofSatoshi(100_000_000n),
        applyFee: true,
      });

      expect(feeAmount.isZero()).toBe(true);
      expect(calls).toHaveLength(1);
    });
  });
});
