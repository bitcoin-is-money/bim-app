export interface DeleteDescriptionInput {
  accountId: string;
  transactionHash: string;
}

/**
 * Deletes a description from a transaction.
 */
export interface DeleteTransactionDescriptionUseCase {
  deleteDescription(input: DeleteDescriptionInput): Promise<void>;
}
