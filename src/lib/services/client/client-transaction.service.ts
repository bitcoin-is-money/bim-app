import {
	TransactionApiService,
	TransactionSigner,
	SwapOrchestrator,
	type UnsignedTransaction,
	type SignedTransaction,
	type TransactionPhase,
	type ClaimResult
} from './transaction';

// Re-export types for backward compatibility
export type { UnsignedTransaction, SignedTransaction, TransactionPhase };

/**
 * Main client transaction service that coordinates transaction operations
 * by delegating to specialized services for different responsibilities
 */
export class ClientTransactionService {
	private static instance: ClientTransactionService;
	private apiService = new TransactionApiService();
	private signer = new TransactionSigner();
	// Orchestrator for future use when manual signing is re-enabled
	// private _orchestrator = new SwapOrchestrator();

	private constructor() {}

	static getInstance(): ClientTransactionService {
		if (!ClientTransactionService.instance) {
			ClientTransactionService.instance = new ClientTransactionService();
		}
		return ClientTransactionService.instance;
	}

	/**
	 * Get unsigned transactions from server
	 */
	async getUnsignedTransactions(swapId: string): Promise<TransactionPhase> {
		return this.apiService.getUnsignedTransactions(swapId);
	}

	/**
	 * Get unsigned claim transactions from server
	 */
	async getUnsignedClaimTransactions(swapId: string): Promise<UnsignedTransaction[]> {
		return this.apiService.getUnsignedClaimTransactions(swapId);
	}

	/**
	 * Sign transactions using WebAuthn
	 */
	async signTransactions(
		transactions: UnsignedTransaction[],
		swapId: string
	): Promise<SignedTransaction[]> {
		return this.signer.signTransactions(transactions, swapId);
	}

	/**
	 * Submit signed transactions to server
	 */
	async submitSignedTransactions(
		swapId: string,
		phase: 'commit' | 'claim' | 'commit-and-claim',
		signedTransactions: SignedTransaction[]
	): Promise<{ success: boolean; txHash?: string; message: string }> {
		return this.apiService.submitSignedTransactions(swapId, phase, signedTransactions);
	}

	/**
	 * Complete Lightning swap claim with client-side signing
	 * This orchestrates the entire claim workflow
	 */
	async claimLightningSwapWithClientSigning(_swapId: string): Promise<ClaimResult> {
		return {
			success: false,
			message: 'Manual signing is disabled. Paymaster-only is enforced.'
		};
	}
}
