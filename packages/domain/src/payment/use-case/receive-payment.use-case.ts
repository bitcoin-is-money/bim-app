import type {Account} from '../../account';
import type {ReceiveResult} from '../receive.types';

export interface ReceivePaymentInput {
  network: 'lightning' | 'bitcoin' | 'starknet';
  amount?: string | undefined;
  description?: string | undefined;
  useUriPrefix: boolean;
  account: Account;
}

/**
 * For Lightning/Starknet: the standard ReceiveResult.
 * For Bitcoin pending_commit: a build-ready response with cache ID.
 */
export interface BitcoinPendingCommitOutput {
  network: 'bitcoin';
  status: 'pending_commit';
  buildId: string;
  messageHash: string;
  credentialId: string;
  swapId: string;
  amountSats: string;
  expiresAt: Date;
}

export type ReceivePaymentOutput = ReceiveResult | BitcoinPendingCommitOutput;

/**
 * Creates a receive request for the given network.
 * For Bitcoin, returns commit data for WebAuthn signing (two-phase flow).
 */
export interface ReceivePaymentUseCase {
  receivePayment(input: ReceivePaymentInput): Promise<ReceivePaymentOutput>;
}
