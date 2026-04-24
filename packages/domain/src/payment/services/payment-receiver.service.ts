import type {Logger} from 'pino';
import {AccountNotDeployedError, Amount, type StarknetAddress, type StarknetConfig} from '../../shared';
import {LightningInvoice, type SwapService} from '../../swap';
import {InvalidPaymentAmountError} from '../errors';
import type {ReceivePaymentInput as DomainReceiveInput, ReceiveResult} from '../receive.types';
import type {
  CommitReceiveInput,
  CommitReceiveOutput,
  CommitReceiveUseCase,
} from '../use-cases/commit-receive.use-case';
import type {
  ReceivePaymentInput,
  ReceivePaymentOutput,
  ReceivePaymentUseCase,
} from '../use-cases/receive-payment.use-case';
import type {BitcoinReceiver} from './bitcoin-receiver.service';

export interface PaymentReceiverDeps {
  swapService: SwapService;
  bitcoinReceiver: BitcoinReceiver;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

/**
 * Handles incoming payments (receive flow). Implements the two primary ports:
 *
 * - `receive` — creates a receive request for any supported network. For
 *   Bitcoin, returns a pending-commit response (phase 1 of two-phase flow).
 * - `commit` — completes the Bitcoin receive after WebAuthn signing (phase 2).
 *
 * Delegates the Bitcoin-specific commit logic to the internal
 * BitcoinReceiver domain service.
 */
export class PaymentReceiver implements ReceivePaymentUseCase, CommitReceiveUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: PaymentReceiverDeps) {
    this.log = deps.logger.child({name: 'payment-receiver.service.ts'});
  }

  // ===========================================================================
  // UseCase: ReceivePaymentUseCase
  // ===========================================================================

  async receive(input: ReceivePaymentInput): Promise<ReceivePaymentOutput> {
    const {account} = input;
    const starknetAddress = account.getStarknetAddress();
    if (!starknetAddress) {
      throw new AccountNotDeployedError();
    }

    const amount = input.amount
      ? Amount.ofSatoshi(BigInt(input.amount))
      : undefined;
    const description = input.description?.trim();

    const result = await this.prepareReceive({
      network: input.network,
      destinationAddress: starknetAddress,
      ...(amount !== undefined && {amount}),
      description,
      accountId: account.id,
      useUriPrefix: input.useUriPrefix,
    });

    // Bitcoin pending commit: delegate to BitcoinReceiver
    if (result.network === 'bitcoin' && 'status' in result) {
      const {buildId, messageHash} = await this.deps.bitcoinReceiver.prepareCommit({
        swapId: result.swapId,
        commitCalls: result.commitCalls,
        amount: result.amount,
        expiresAt: result.expiresAt,
        starknetAddress,
        account,
        description,
        useUriPrefix: input.useUriPrefix,
      });

      return {
        network: 'bitcoin',
        status: 'pending_commit',
        buildId,
        messageHash,
        credentialId: account.credentialId,
        swapId: result.swapId,
        amountSats: result.amount.toSatString(),
        expiresAt: result.expiresAt,
      };
    }

    return result;
  }

  // ===========================================================================
  // UseCase: CommitReceiveUseCase
  // ===========================================================================

  async commit(input: CommitReceiveInput): Promise<CommitReceiveOutput> {
    const result = await this.deps.bitcoinReceiver.commitAndComplete({
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
  // Internal helper — builds the raw receive request by network.
  // Kept public (no UseCase interface) so tests can exercise the
  // network-specific branches without stubbing BitcoinReceiver.
  // ===========================================================================

  async prepareReceive(input: DomainReceiveInput): Promise<ReceiveResult> {
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
  // Private Helpers (per-network)
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
