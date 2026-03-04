import {Amount} from '../shared';
import type {FeeConfig} from './fee';
import {FeeCalculator} from './fee';

/**
 * Represents a Starknet ERC-20 transfer call.
 */
export interface TransferCall {
  /** Token contract address */
  readonly contractAddress: string;
  /** ERC-20 transfer entrypoint */
  readonly entrypoint: 'transfer';
  /** Calldata: [recipientAddress, amountLow, amountHigh] */
  readonly calldata: readonly [string, string, string];
}

/**
 * Result of creating transfer calls.
 */
export interface TransferResult {
  /** All calls to execute (1 without fee, 1-2 with fee) */
  readonly calls: readonly TransferCall[];
  /** The calculated fee amount (zero if no fee applied) */
  readonly feeAmount: Amount;
}

/**
 * Factory for creating ERC-20 transfer calls.
 *
 * Creates Starknet ERC-20 transfer calls that can be executed via a
 * Starknet gateway. Holds the fee configuration as a dependency, so
 * callers only need to specify whether fees apply.
 */
export class Erc20CallFactory {
  constructor(
    private readonly feeConfig: FeeConfig
  ) {
  }

  /**
   * Creates ERC-20 transfer calls, optionally including a BIM fee call.
   *
   * When `applyFee` is true, a second transfer call to the BIM treasury
   * is appended if the calculated fee is positive.
   *
   * @param params.tokenAddress - The ERC-20 token contract address
   * @param params.recipientAddress - The recipient's Starknet address
   * @param params.amount - The amount to transfer
   * @param params.applyFee - Whether to include a BIM developer fee
   * @returns TransferResult with calls array and fee amount
   */
  createTransfer(params: {
    tokenAddress: string;
    recipientAddress: string;
    amount: Amount;
    applyFee: boolean;
  }): TransferResult {
    const transferCall = this.buildCall(
      params.tokenAddress,
      params.recipientAddress,
      params.amount,
    );

    if (!params.applyFee) {
      return {
        calls: [transferCall],
        feeAmount: Amount.zero()
      };
    }

    const feeAmount = FeeCalculator.calculateFee(
      params.amount,
      this.feeConfig.percentage,
    );

    if (feeAmount.getSat() === 0n) {
      return {
        calls: [transferCall],
        feeAmount: Amount.zero()
      };
    }

    const feeCall = this.buildCall(
      params.tokenAddress,
      this.feeConfig.recipientAddress.toString(),
      feeAmount,
    );

    return {
      calls: [transferCall, feeCall],
      feeAmount
    };
  }

  /**
   * Creates only the BIM fee transfer call for a given token and amount.
   *
   * Used for swap payments (Lightning/Bitcoin) where the main transfer is
   * handled by Atomiq commit calls, but BIM still needs to collect its fee.
   */
  createFeeCall(tokenAddress: string, amount: Amount): TransferResult {
    const feeAmount = FeeCalculator.calculateFee(
      amount,
      this.feeConfig.percentage,
    );

    if (feeAmount.getSat() === 0n) {
      return {calls: [], feeAmount: Amount.zero()};
    }

    const feeCall = this.buildCall(
      tokenAddress,
      this.feeConfig.recipientAddress.toString(),
      feeAmount,
    );

    return {calls: [feeCall], feeAmount};
  }

  private buildCall(
    tokenAddress: string,
    recipientAddress: string,
    amount: Amount,
  ): TransferCall {
    return {
      contractAddress: tokenAddress,
      entrypoint: 'transfer',
      calldata: [
        recipientAddress,
        amount.toSatString(),
        '0', // high part of u256 (always 0 for amounts < 2^128)
      ] as const,
    };
  }
}
