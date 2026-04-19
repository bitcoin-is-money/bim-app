import type {Account} from '../../account';
import type {Amount, BitcoinAddress} from '../../shared';
import type {WebAuthnAssertion} from '../types';

export interface CommitReceiveInput {
  buildId: string;
  assertion: WebAuthnAssertion;
  account: Account;
}

export interface CommitReceiveOutput {
  network: 'bitcoin';
  swapId: string;
  depositAddress: BitcoinAddress;
  bip21Uri: string;
  amount: Amount;
  expiresAt: Date;
}

/**
 * Commits a Bitcoin receive: processes WebAuthn signature, submits commit tx,
 * waits for confirmation, and returns the deposit address.
 */
export interface CommitReceiveUseCase {
  commitReceive(input: CommitReceiveInput): Promise<CommitReceiveOutput>;
}
