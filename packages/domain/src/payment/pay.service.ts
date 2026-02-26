import type {Logger} from 'pino';
import {AccountId, StarknetAddress} from '../account';
import type {StarknetGateway, TransactionRepository} from '../ports';
import {Amount, type StarknetConfig} from '../shared';
import type {SwapService} from '../swap';
import {TransactionHash} from '../user/types';
import type {Erc20CallFactory} from './erc20-call.factory';
import {FeeCalculator, type FeeConfig} from './fee';
import type {ParseService} from './parse.service';
import {InvalidPaymentAmountError, SameAddressPaymentError} from './errors';
import type {ExecutePaymentInput, PaymentResult, PreparedCalls, PreparedPayment} from './pay.types';
import type {ParsedPaymentData} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface PayServiceDeps {
  parseService: ParseService;
  erc20CallFactory: Erc20CallFactory;
  starknetGateway: StarknetGateway;
  swapService: SwapService;
  transactionRepository: TransactionRepository;
  starknetConfig: StarknetConfig;
  feeConfig: FeeConfig;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Pay service — handles outgoing payments (send).
 *
 * Provides:
 * - `prepare()`: parse + fee calculation (for display)
 * - `prepareCalls()`: parse + create Starknet calls (for SNIP-29 build step)
 * - `savePaymentResult()`: persist transaction metadata after execution
 */
export class PayService {
  private readonly log: Logger;

  constructor(private readonly deps: PayServiceDeps) {
    this.log = deps.logger.child({name: 'pay.service.ts'});
  }

  // ===========================================================================
  // PREPARE (parse + fee calculation, for display)
  // ===========================================================================

  /**
   * Parse payment data and calculate the applicable fee.
   *
   * BIM fee is applied only to Starknet direct transfers.
   * Lightning and Bitcoin swaps have no BIM fee (swap fees are handled by Atomiq).
   */
  prepare(paymentPayload: string): PreparedPayment {
    const parsed = this.deps.parseService.parse(paymentPayload);
    const fee = parsed.network === 'starknet'
      ? FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentage)
      : Amount.zero();
    return {...parsed, fee};
  }

  // ===========================================================================
  // PREPARE CALLS (parse + create Starknet calls for SNIP-29 build)
  // ===========================================================================

  /**
   * Parse payment data and create Starknet calls to execute.
   * For Lightning/Bitcoin, this also creates the swap (which has a timeout).
   *
   * Returns the calls + metadata needed for the execute step.
   */
  async prepareCalls(paymentPayload: string, senderAddress: StarknetAddress, accountId: string, description: string): Promise<PreparedCalls> {
    this.log.info({paymentPayload, senderAddress: senderAddress.toString()}, 'Preparing payment calls');
    const parsed = this.deps.parseService.parse(paymentPayload);

    switch (parsed.network) {
      case 'starknet':
        return this.prepareStarknetCalls(senderAddress, parsed);
      case 'lightning':
        return this.prepareLightningCalls(senderAddress, parsed, accountId, description);
      case 'bitcoin':
        return this.prepareBitcoinCalls(senderAddress, parsed, accountId, description);
    }
  }

  private prepareStarknetCalls(
    senderAddress: StarknetAddress,
    parsed: Extract<ParsedPaymentData, {network: 'starknet'}>,
  ): PreparedCalls {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('starknet', parsed.amount.getSat());
    }
    if (senderAddress.toString() === parsed.address.toString()) {
      throw new SameAddressPaymentError();
    }

    const {calls, feeAmount} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: parsed.tokenAddress,
      recipientAddress: parsed.address.toString(),
      amount: parsed.amount,
      applyFee: true,
    });

    return {
      network: 'starknet',
      calls,
      amount: parsed.amount,
      feeAmount,
      recipientAddress: parsed.address,
      tokenAddress: parsed.tokenAddress,
    };
  }

  private async prepareLightningCalls(
    senderAddress: StarknetAddress,
    parsed: Extract<ParsedPaymentData, {network: 'lightning'}>,
    accountId: string,
    description: string,
  ): Promise<PreparedCalls> {
    const swapResult = await this.deps.swapService.createStarknetToLightning({
      invoice: parsed.invoice,
      sourceAddress: senderAddress,
      accountId,
      description,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);
    const {calls} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: this.deps.starknetConfig.wbtcTokenAddress,
      recipientAddress: depositAddress.toString(),
      amount: swapResult.amount,
      applyFee: false,
    });

    return {
      network: 'lightning',
      calls,
      amount: swapResult.amount,
      swapId: swapResult.swap.id,
      invoice: parsed.invoice,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  private async prepareBitcoinCalls(
    senderAddress: StarknetAddress,
    parsed: Extract<ParsedPaymentData, {network: 'bitcoin'}>,
    accountId: string,
    description: string,
  ): Promise<PreparedCalls> {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('bitcoin', parsed.amount.getSat());
    }

    const swapResult = await this.deps.swapService.createStarknetToBitcoin({
      amount: parsed.amount,
      destinationAddress: parsed.address,
      sourceAddress: senderAddress,
      accountId,
      description,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);
    const {calls} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: this.deps.starknetConfig.wbtcTokenAddress,
      recipientAddress: depositAddress.toString(),
      amount: parsed.amount,
      applyFee: false,
    });

    return {
      network: 'bitcoin',
      calls,
      amount: parsed.amount,
      swapId: swapResult.swap.id,
      destinationAddress: parsed.address,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // SAVE RESULT (persist transaction metadata after execute)
  // ===========================================================================

  async savePaymentResult(params: {
    txHash: string;
    accountId: string;
    description: string;
  }): Promise<void> {
    await this.deps.transactionRepository.saveDescription(
      TransactionHash.of(params.txHash),
      AccountId.of(params.accountId),
      params.description,
    );
  }

  // ===========================================================================
  // LEGACY EXECUTE (deprecated — use prepareCalls + build/execute flow)
  // ===========================================================================

  /**
   * @deprecated Use prepareCalls() + starknetGateway.buildCalls/executeSignedCalls
   */
  async execute(input: ExecutePaymentInput): Promise<PaymentResult> {
    this.log.info(input, 'Executing payment');
    const parsed: ParsedPaymentData = this.deps.parseService.parse(input.paymentPayload);

    let result: PaymentResult;
    switch (parsed.network) {
      case 'starknet':
        result = {network: 'starknet', ...(await this.payStarknet(input, parsed))};
        break;
      case 'lightning':
        result = {network: 'lightning', ...(await this.payLightning(input, parsed))};
        break;
      case 'bitcoin':
        result = {network: 'bitcoin', ...(await this.payBitcoin(input, parsed))};
        break;
    }

    if (result.txHash) {
      await this.deps.transactionRepository.saveDescription(
        TransactionHash.of(result.txHash),
        AccountId.of(input.accountId),
        input.description,
      );
    }

    this.log.info({network: result.network, txHash: result.txHash}, 'Payment completed');
    return result;
  }

  // ===========================================================================
  // Starknet — direct ERC-20 transfer
  // ===========================================================================

  private async payStarknet(
    input: ExecutePaymentInput,
    parsed: Extract<ParsedPaymentData, {network: 'starknet'}>,
  ) {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('starknet', parsed.amount.getSat());
    }
    if (input.senderAddress === parsed.address) {
      throw new SameAddressPaymentError();
    }

    const {calls, feeAmount} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: parsed.tokenAddress,
      recipientAddress: parsed.address,
      amount: parsed.amount,
      applyFee: true,
    });

    const {txHash} = await this.deps.starknetGateway.executeCalls({
      senderAddress: input.senderAddress,
      calls,
    });

    return {
      txHash,
      amount: parsed.amount,
      feeAmount,
      recipientAddress: parsed.address,
      tokenAddress: parsed.tokenAddress,
    };
  }

  // ===========================================================================
  // Lightning — Starknet → Lightning swap + WBTC deposit
  // ===========================================================================

  private async payLightning(
    input: ExecutePaymentInput,
    parsed: Extract<ParsedPaymentData, {network: 'lightning'}>,
  ) {
    const swapResult = await this.deps.swapService.createStarknetToLightning({
      invoice: parsed.invoice,
      sourceAddress: input.senderAddress,
      accountId: input.accountId,
      description: input.description,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);
    const {txHash} = await this.executeDeposit(input.senderAddress, depositAddress, swapResult.amount);

    return {
      txHash,
      swapId: swapResult.swap.id,
      invoice: parsed.invoice,
      amount: swapResult.amount,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // Bitcoin — Starknet → Bitcoin swap + WBTC deposit
  // ===========================================================================

  private async payBitcoin(
    input: ExecutePaymentInput,
    parsed: Extract<import('./types').ParsedPaymentData, {network: 'bitcoin'}>,
  ) {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('bitcoin', parsed.amount.getSat());
    }

    const swapResult = await this.deps.swapService.createStarknetToBitcoin({
      amount: parsed.amount,
      destinationAddress: parsed.address,
      sourceAddress: input.senderAddress,
      accountId: input.accountId,
      description: input.description,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);
    const {txHash} = await this.executeDeposit(input.senderAddress, depositAddress, parsed.amount);

    return {
      txHash,
      swapId: swapResult.swap.id,
      amount: parsed.amount,
      destinationAddress: parsed.address,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // Shared helper — WBTC deposit for swap-based payments
  // ===========================================================================

  private async executeDeposit(
    senderAddress: StarknetAddress,
    depositAddress: StarknetAddress,
    amount: Amount,
  ): Promise<{txHash: string}> {
    const {calls} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: this.deps.starknetConfig.wbtcTokenAddress,
      recipientAddress: depositAddress,
      amount,
      applyFee: false,
    });

    return this.deps.starknetGateway.executeCalls({senderAddress, calls});
  }
}
