/**
 * @fileoverview Swap Claiming Service for Atomiq (Refactored)
 *
 * This service has been refactored to use focused classes for better separation
 * of concerns. It now delegates to ClaimOrchestrator for coordination.
 *
 * @author bim
 * @version 2.0.0
 */

import { logger } from '$lib/utils/logger';
import { ClaimOrchestrator, type ClaimResult } from './claim';
import type { AtomiqConfig } from './types';

/**
 * Service for claiming swaps after payment confirmation
 *
 * @deprecated This service has been refactored. Use ClaimOrchestrator directly.
 * This class is maintained for backward compatibility.
 */
export class SwapClaimerService {
	private orchestrator: ClaimOrchestrator;

	constructor(private config: AtomiqConfig) {
		this.orchestrator = new ClaimOrchestrator(config);
		logger.info('SwapClaimerService initialized (refactored)');
	}

	/**
	 * Claims a Lightning swap after payment has been received
	 */
	async claimLightningSwap(
		swap: any,
		swapId: string,
		starknetSigner?: any,
		isPaidInBackground: boolean = false
	): Promise<ClaimResult> {
		return this.orchestrator.claimLightningSwap(swap, swapId, starknetSigner, isPaidInBackground);
	}

	/**
	 * Gets unsigned claim transactions for manual signing
	 */
	async getUnsignedClaimTransactions(
		swap: any,
		swapId: string
	): Promise<{
		success: boolean;
		transactions?: any[];
		message: string;
	}> {
		return this.orchestrator.getUnsignedClaimTransactions(swap, swapId);
	}

	/**
	 * Submits signed transactions to complete the swap claim
	 */
	async submitSignedTransactions(
		swap: any,
		swapId: string,
		signedTransactions: any[]
	): Promise<ClaimResult> {
		return this.orchestrator.submitSignedTransactions(swap, swapId, signedTransactions);
	}
}

// Re-export types for backward compatibility
export type { ClaimResult };
