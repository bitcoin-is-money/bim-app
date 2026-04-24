import {randomUUID} from 'node:crypto';
import type {Logger} from 'pino';
import type {Account} from '../../account';
import type {StarknetGateway} from '../../ports';
import {AccountNotDeployedError, type StarknetAddress, type StarknetConfig} from '../../shared';
import type {SwapCoordinator} from '../../swap';
import {InvalidPaymentAmountError, SameAddressPaymentError} from '../errors';
import type {PreparedCalls, PreparedPaymentData} from '../pay.types';
import type {PaymentBuildCache} from '../payment-build.cache';
import type {ParsedPaymentData} from '../types';
import type {
  BuildPaymentInput,
  BuildPaymentOutput,
  BuildPaymentUseCase,
} from '../use-cases/build-payment.use-case';
import type {Erc20CallFactory} from './erc20-call.factory';
import type {PaymentParser} from './payment-parser.service';
import type {PaymentPreparator} from './payment-preparator.service';

export interface PaymentBuilderDeps {
  paymentParser: PaymentParser;
  paymentPreparator: PaymentPreparator;
  erc20CallFactory: Erc20CallFactory;
  swapCoordinator: SwapCoordinator;
  starknetGateway: StarknetGateway;
  paymentBuildCache: PaymentBuildCache;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

/**
 * Builds a payment: parse → prepare (fee) → create Starknet calls → typed data → cache.
 *
 * Network-specific call creation (Starknet transfer / Lightning or Bitcoin swap +
 * BIM fee) is handled by the private prepare*Calls methods.
 */
export class PaymentBuilder implements BuildPaymentUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: PaymentBuilderDeps) {
    this.log = deps.logger.child({name: 'payment-builder.service.ts'});
  }

  async build(input: BuildPaymentInput): Promise<BuildPaymentOutput> {
    const senderAddress = requireDeployedAddress(input.account);

    // 1. Parse once — single source of truth for destination, amount, etc.
    const parsed = this.deps.paymentParser.parse(input.paymentPayload);
    const prepared: PreparedPaymentData = await this.deps.paymentPreparator.prepare(parsed);

    // 2. Prepare calls using already-parsed data
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty description should fallback
    const description = input.description || parsed.description || 'Sent';
    const preparedCalls = await this.prepareCalls(parsed, senderAddress, input.account.id, description);

    // 3. Build typed data via AVNU paymaster
    const {typedData, messageHash} = await this.deps.starknetGateway.buildCalls({
      senderAddress,
      calls: preparedCalls.calls,
    });

    // 4. Cache for execute step
    const buildId = randomUUID();
    this.deps.paymentBuildCache.set(buildId, {
      preparedCalls,
      typedData,
      senderAddress,
      accountId: input.account.id,
      description,
      createdAt: Date.now(),
    });

    // 5. For swap networks, use the real LP-quoted fee instead of the estimated percentage
    if (preparedCalls.network === 'lightning' || preparedCalls.network === 'bitcoin') {
      const lpFee = preparedCalls.amount.subtract(prepared.amount);
      prepared.fee = lpFee.add(preparedCalls.feeAmount);
    }

    this.log.info({buildId, network: parsed.network}, 'Payment built');

    return {
      buildId,
      messageHash,
      credentialId: input.account.credentialId,
      prepared,
      feeAmount: preparedCalls.feeAmount,
    };
  }

  // ===========================================================================
  // Prepare calls per network (was PayService.prepareCalls)
  // ===========================================================================

  private async prepareCalls(
    parsed: ParsedPaymentData,
    senderAddress: StarknetAddress,
    accountId: string,
    description: string,
  ): Promise<PreparedCalls> {
    this.log.info({network: parsed.network, senderAddress: senderAddress.toString()}, 'Preparing payment calls');

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
      network: 'starknet',
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
    const swapResult = await this.deps.swapCoordinator.createStarknetToLightning({
      invoice: parsed.invoice,
      sourceAddress: senderAddress,
      accountId,
      description,
    });

    const {calls: feeCalls, feeAmount} = this.deps.erc20CallFactory.createFeeCall(
      this.deps.starknetConfig.wbtcTokenAddress,
      parsed.amount,
      'lightning',
    );

    return {
      network: 'lightning',
      calls: [...swapResult.commitCalls, ...feeCalls],
      amount: swapResult.amount,
      feeAmount,
      swapId: swapResult.swap.data.id,
      invoice: parsed.invoice,
      expiresAt: swapResult.swap.data.expiresAt,
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

    const swapResult = await this.deps.swapCoordinator.createStarknetToBitcoin({
      amount: parsed.amount,
      destinationAddress: parsed.address,
      sourceAddress: senderAddress,
      accountId,
      description,
    });

    const {calls: feeCalls, feeAmount} = this.deps.erc20CallFactory.createFeeCall(
      this.deps.starknetConfig.wbtcTokenAddress,
      parsed.amount,
      'bitcoin',
    );

    return {
      network: 'bitcoin',
      calls: [...swapResult.commitCalls, ...feeCalls],
      amount: swapResult.amount,
      feeAmount,
      swapId: swapResult.swap.data.id,
      destinationAddress: parsed.address,
      expiresAt: swapResult.swap.data.expiresAt,
    };
  }
}

function requireDeployedAddress(account: Account): ReturnType<Account['requireStarknetAddress']> {
  const address = account.getStarknetAddress();
  if (!address) throw new AccountNotDeployedError();
  return address;
}
