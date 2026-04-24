import {serializeError} from '@bim/lib/error';
import type {Logger} from 'pino';
import {AccountId} from '../../account';
import {DonationReceived, InvalidOwnerSignature} from '../../notifications';
import type {
  AccountRepository,
  NotificationGateway,
  SignatureProcessor,
  StarknetGateway,
  TransactionRepository,
} from '../../ports';
import {BuildExpiredError, ExternalServiceError, ForbiddenError, type StarknetConfig} from '../../shared';
import {TransactionHash} from '../../user/types';
import type {PaymentResult, PreparedCalls} from '../pay.types';
import type {PaymentBuildCache} from '../payment-build.cache';
import type {
  ExecutePaymentInput,
  ExecutePaymentOutput,
  ExecutePaymentUseCase,
} from '../use-cases/execute-payment.use-case';

export interface PaymentExecutorDeps {
  paymentBuildCache: PaymentBuildCache;
  signatureProcessor: SignatureProcessor;
  starknetGateway: StarknetGateway;
  accountRepository: AccountRepository;
  transactionRepository: TransactionRepository;
  notificationGateway: NotificationGateway;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

/**
 * Executes a previously built payment: validates cache, processes WebAuthn
 * signature, submits the transaction on Starknet, and saves transaction
 * descriptions (sender + recipient when applicable).
 */
export class PaymentExecutor implements ExecutePaymentUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: PaymentExecutorDeps) {
    this.log = deps.logger.child({name: 'payment-executor.service.ts'});
  }

  async execute(input: ExecutePaymentInput): Promise<ExecutePaymentOutput> {
    const {account} = input;

    const build = this.deps.paymentBuildCache.consume(input.buildId);
    if (!build) {
      throw new BuildExpiredError();
    }

    if (account.id !== build.accountId) {
      throw new ForbiddenError('Build does not belong to this account');
    }

    const signature = this.deps.signatureProcessor.process(input.assertion, account.publicKey);

    const txHash = await this.executeSignedCalls(build.senderAddress, build.typedData, signature, account.publicKey);

    await this.saveDescription(txHash, build.accountId, build.description);

    // Save description for recipient (if Starknet transfer to a BIM user)
    if (build.preparedCalls.network === 'starknet') {
      const recipientAccount = await this.deps.accountRepository.findByStarknetAddress(
        build.preparedCalls.recipientAddress,
      );
      if (recipientAccount) {
        await this.saveDescription(txHash, recipientAccount.id, build.description);
      }
    }

    // Notify Slack for donations
    if (build.isDonation) {
      const message = DonationReceived.build({
        username: account.username,
        senderAddress: build.senderAddress.toString(),
        amountSats: build.preparedCalls.amount.getSat(),
        network: this.deps.starknetConfig.network,
      });
      this.deps.notificationGateway.send(message).catch((err: unknown) => {
        this.log.warn({cause: serializeError(err)}, 'Failed to send donation notification');
      });
    }

    return buildPaymentResult(txHash, build.preparedCalls);
  }

  private async saveDescription(txHash: string, accountId: string, description: string): Promise<void> {
    await this.deps.transactionRepository.saveDescription(
      TransactionHash.of(txHash),
      AccountId.of(accountId),
      description,
    );
  }

  private async executeSignedCalls(
    senderAddress: Parameters<StarknetGateway['executeSignedCalls']>[0]['senderAddress'],
    typedData: unknown,
    signature: string[],
    publicKey: string,
  ): Promise<string> {
    try {
      const {txHash} = await this.deps.starknetGateway.executeSignedCalls({
        senderAddress,
        typedData,
        signature,
      });
      return txHash;
    } catch (executeError) {
      if (executeError instanceof ExternalServiceError
          && executeError.message.includes('invalid-owner-sig')) {
        const alertMessage = InvalidOwnerSignature.build({
          senderAddress,
          publicKey,
          typedData,
          signature,
          error: executeError.message,
          network: this.deps.starknetConfig.network,
        });
        this.deps.notificationGateway.send(alertMessage).catch((err: unknown) => {
          this.log.warn({cause: serializeError(err)}, 'Failed to send invalid-owner-sig alert');
        });
      }
      throw executeError;
    }
  }
}

function buildPaymentResult(txHash: string, preparedCalls: PreparedCalls): PaymentResult {
  switch (preparedCalls.network) {
    case 'starknet':
      return {
        network: 'starknet', txHash,
        amount: preparedCalls.amount, feeAmount: preparedCalls.feeAmount,
        recipientAddress: preparedCalls.recipientAddress, tokenAddress: preparedCalls.tokenAddress,
      };
    case 'lightning':
      return {
        network: 'lightning', txHash,
        amount: preparedCalls.amount, swapId: preparedCalls.swapId,
        invoice: preparedCalls.invoice, expiresAt: preparedCalls.expiresAt,
      };
    case 'bitcoin':
      return {
        network: 'bitcoin', txHash,
        amount: preparedCalls.amount, swapId: preparedCalls.swapId,
        destinationAddress: preparedCalls.destinationAddress, expiresAt: preparedCalls.expiresAt,
      };
  }
}
