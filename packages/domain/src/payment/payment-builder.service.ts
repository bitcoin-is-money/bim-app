import type {Logger} from 'pino';
import {randomUUID} from 'node:crypto';
import type {Account} from '../account';
import type {StarknetGateway} from '../ports';
import {AccountNotDeployedError, Amount, type StarknetConfig} from '../shared';
import type {PaymentBuildCache} from './payment-build.cache';
import type {PreparedPaymentData} from './pay.types';
import type {ParseService} from './parse.service';
import type {PayService} from './pay.service';
import type {BuildDonationInput, BuildDonationOutput, BuildDonationUseCase} from './use-case/build-donation.use-case';
import type {BuildPaymentInput, BuildPaymentOutput, BuildPaymentUseCase} from './use-case/build-payment.use-case';

// =============================================================================
// Dependencies
// =============================================================================

export interface PaymentBuilderServiceDeps {
  payService: PayService;
  parseService: ParseService;
  starknetGateway: StarknetGateway;
  paymentBuildCache: PaymentBuildCache;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Builds payment and donation transactions (typed data + cache for execute step).
 */
export class PaymentBuilderService implements BuildPaymentUseCase, BuildDonationUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: PaymentBuilderServiceDeps) {
    this.log = deps.logger.child({name: 'payment-builder.service.ts'});
  }

  async buildPayment(input: BuildPaymentInput): Promise<BuildPaymentOutput> {
    const senderAddress = requireDeployedAddress(input.account);

    // 1. Parse once — single source of truth for destination, amount, etc.
    const parsed = this.deps.parseService.parse(input.paymentPayload);
    const prepared: PreparedPaymentData = await this.deps.payService.prepare(parsed);

    // 2. Prepare calls using already-parsed data
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty description should fallback
    const description = input.description || parsed.description || 'Sent';
    const preparedCalls = await this.deps.payService.prepareCalls(parsed, senderAddress, input.account.id, description);

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

  async buildDonation(input: BuildDonationInput): Promise<BuildDonationOutput> {
    const senderAddress = requireDeployedAddress(input.account);

    const treasuryAddress = this.deps.starknetConfig.feeTreasuryAddress;
    const wbtcTokenAddress = this.deps.starknetConfig.wbtcTokenAddress;
    const amount = Amount.ofSatoshi(BigInt(input.amountSats));

    // Build ERC-20 transfer call to treasury (no fee on donations)
    const calls = [{
      contractAddress: wbtcTokenAddress.toString(),
      entrypoint: 'transfer' as const,
      calldata: [treasuryAddress.toString(), amount.toSatString(), '0'] as const,
    }];

    const {typedData, messageHash} = await this.deps.starknetGateway.buildCalls({
      senderAddress,
      calls,
    });

    const buildId = randomUUID();
    this.deps.paymentBuildCache.set(buildId, {
      preparedCalls: {
        network: 'starknet',
        calls,
        amount,
        feeAmount: Amount.zero(),
        recipientAddress: treasuryAddress,
        tokenAddress: wbtcTokenAddress,
      },
      typedData,
      senderAddress,
      accountId: input.account.id,
      description: 'Donation',
      createdAt: Date.now(),
      isDonation: true,
    });

    this.log.info({buildId}, 'Donation built');

    return {buildId, messageHash, credentialId: input.account.credentialId};
  }
}

function requireDeployedAddress(account: Account): ReturnType<Account['requireStarknetAddress']> {
  const address = account.getStarknetAddress();
  if (!address) throw new AccountNotDeployedError();
  return address;
}
