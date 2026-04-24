import {randomUUID} from 'node:crypto';
import type {Logger} from 'pino';
import type {Account} from '../../account';
import type {StarknetGateway} from '../../ports';
import {AccountNotDeployedError, Amount, type StarknetConfig} from '../../shared';
import type {PaymentBuildCache} from '../payment-build.cache';
import type {
  BuildDonationInput,
  BuildDonationOutput,
  BuildDonationUseCase,
} from '../use-cases/build-donation.use-case';

export interface DonationBuilderDeps {
  starknetGateway: StarknetGateway;
  paymentBuildCache: PaymentBuildCache;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

/**
 * Builds a donation: creates an ERC-20 transfer to the treasury (no fee),
 * builds typed data, and caches the result for execution.
 */
export class DonationBuilder implements BuildDonationUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: DonationBuilderDeps) {
    this.log = deps.logger.child({name: 'donation-builder.service.ts'});
  }

  async build(input: BuildDonationInput): Promise<BuildDonationOutput> {
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
