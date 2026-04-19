export interface SetDescriptionInput {
  accountId: string;
  transactionHash: string;
  description: string;
}

/**
 * Sets a description on a transaction.
 */
export interface SetTransactionDescriptionUseCase {
  setDescription(input: SetDescriptionInput): Promise<void>;
}
