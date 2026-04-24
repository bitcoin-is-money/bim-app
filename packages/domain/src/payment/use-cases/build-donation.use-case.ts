import type {Account} from '../../account';

export interface BuildDonationInput {
  amountSats: string;
  account: Account;
}

export interface BuildDonationOutput {
  buildId: string;
  messageHash: string;
  credentialId: string;
}

/**
 * Builds a donation: creates an ERC-20 transfer to the treasury, no fee.
 */
export interface BuildDonationUseCase {
  build(input: BuildDonationInput): Promise<BuildDonationOutput>;
}
