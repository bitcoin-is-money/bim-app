import type {Logger} from 'pino';
import {AccountNotDeployedError, Amount, type StarknetAddress, type StarknetConfig} from '../shared';
import {LightningInvoice, type SwapService} from '../swap';
import type {BitcoinReceiveService} from './bitcoin-receive.service';
import {InvalidPaymentAmountError} from './errors';
import type {ReceivePaymentInput as DomainReceiveInput, ReceiveResult} from './receive.types';
import type {CommitReceiveInput, CommitReceiveOutput, CommitReceiveUseCase} from './use-case/commit-receive.use-case';
import type {
  BitcoinPendingCommitOutput,
  ReceivePaymentInput,
  ReceivePaymentOutput,
  ReceivePaymentUseCase
} from './use-case/receive-payment.use-case';

// =============================================================================
// Dependencies
// =============================================================================

export interface ReceiveServiceDeps {
  swapService: SwapService;
  bitcoinReceiveService: BitcoinReceiveService;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Receive service — handles incoming payments (receive).
 *
 * For Lightning and Bitcoin, creates a swap (invoice or deposit address).
 * For Starknet, returns the user's address + a starknet: URI.
 */
export class ReceiveService implements ReceivePaymentUseCase, CommitReceiveUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: ReceiveServiceDeps) {
    this.log = deps.logger.child({name: 'receive.service.ts'});
  }

  // ===========================================================================
  // UseCase: ReceivePaymentUseCase
  // ===========================================================================

  async receivePayment(input: ReceivePaymentInput): Promise<ReceivePaymentOutput> {
    const {account} = input;
    const starknetAddress = account.getStarknetAddress();
    if (!starknetAddress) {
      throw new AccountNotDeployedError();
    }

    const amount = input.amount
      ? Amount.ofSatoshi(BigInt(input.amount))
      : undefined;
    const description = input.description?.trim();

    const result = await this.receive({
      network: input.network,
      destinationAddress: starknetAddress,
      ...(amount !== undefined && {amount}),
      description,
      accountId: account.id,
      useUriPrefix: input.useUriPrefix,
    });

    // Bitcoin pending commit: delegate to BitcoinReceiveService
    if (result.network === 'bitcoin' && 'status' in result) {
      const {buildId, messageHash} = await this.deps.bitcoinReceiveService.handlePendingCommit({
        swapId: result.swapId,
        commitCalls: result.commitCalls,
        amount: result.amount,
        expiresAt: result.expiresAt,
        starknetAddress,
        account,
        description,
        useUriPrefix: input.useUriPrefix,
      });

      const pendingCommitOutput: BitcoinPendingCommitOutput = {
        network: 'bitcoin',
        status: 'pending_commit',
        buildId,
        messageHash,
        credentialId: account.credentialId,
        swapId: result.swapId,
        amountSats: result.amount.toSatString(),
        expiresAt: result.expiresAt,
      };
      return pendingCommitOutput;
    }

    return result;
  }

  // ===========================================================================
  // UseCase: CommitReceiveUseCase
  // ===========================================================================

  async commitReceive(input: CommitReceiveInput): Promise<CommitReceiveOutput> {
    const result = await this.deps.bitcoinReceiveService.commitAndComplete({
      buildId: input.buildId,
      assertion: input.assertion,
      account: input.account,
    });

    return {
      network: 'bitcoin',
      swapId: result.swapId,
      depositAddress: result.depositAddress,
      bip21Uri: result.bip21Uri,
      amount: result.amount,
      expiresAt: result.expiresAt,
    };
  }

  // ===========================================================================
  // Internal: Create receive request (used by receivePayment and tests)
  // ===========================================================================

  async receive(input: DomainReceiveInput): Promise<ReceiveResult> {
    if (input.network !== 'starknet' && (!input.amount?.isPositive())) {
      throw new InvalidPaymentAmountError(input.network, input.amount?.getSat() ?? 0n);
    }

    this.log.info({network: input.network, amountSats: input.amount?.toSatString()}, 'Creating receive request');
    switch (input.network) {
      case 'starknet':
        return {
          network: 'starknet',
          ...this.receiveStarknet(input.destinationAddress, input.amount, input.useUriPrefix, input.description)};
      case 'lightning': {
        const description = input.description ?? 'Received';
        return {
          network: 'lightning',
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...(await this.receiveLightning(input.destinationAddress, input.amount!, input.accountId, description))};
      }
      case 'bitcoin': {
        const description = input.description ?? 'Received';
        return {
          network: 'bitcoin',
          status: 'pending_commit' as const,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...(await this.prepareBitcoinReceive(input.destinationAddress, input.amount!, input.accountId, description))};
      }
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private receiveStarknet(address: StarknetAddress, amount?: Amount, useUriPrefix = true, description?: string) {
    const token = this.deps.starknetConfig.wbtcTokenAddress;
    const prefix = useUriPrefix ? 'starknet:' : '';

    let uri = `${prefix}${address}`;
    const params = new URLSearchParams();
    if (amount?.isPositive()) {
      params.set('amount', amount.toSatString());
      params.set('token', token);
    }
    if (description) {
      params.set('description', description);
    }
    const qs = params.toString();
    if (qs) {
      uri += `?${qs}`;
    }

    return {address, uri};
  }

  private async receiveLightning(destinationAddress: StarknetAddress, amount: Amount, accountId: string, description: string) {
    const result = await this.deps.swapService.createLightningToStarknet({
      amount,
      destinationAddress,
      accountId,
      description,
    });

    return {
      swapId: result.swap.data.id,
      invoice: LightningInvoice.of(result.invoice),
      amount,
      expiresAt: result.swap.data.expiresAt,
    };
  }

  private async prepareBitcoinReceive(
    destinationAddress: StarknetAddress,
    amount: Amount,
    accountId: string,
    description: string,
  ) {
    const result = await this.deps.swapService.prepareBitcoinToStarknet({
      amount,
      destinationAddress,
      accountId,
      description,
    });

    return {
      swapId: result.swapId,
      commitCalls: result.commitCalls,
      amount,
      expiresAt: result.expiresAt,
    };
  }
}
