/**
 * @fileoverview Lightning Claim Manager Service
 *
 * Handles Lightning payment claiming operations including regular and paymaster flows.
 */

import type { UserWithCredentials } from '$lib/services/client/auth.service';
import { logger } from '$lib/utils/logger';

import type { LightningInvoice } from './types';

/**
 * Result of a claim operation
 */
export interface ClaimResult {
	success: boolean;
	message: string;
	txHash?: string;
}

/**
 * Service for managing Lightning payment claims (paymaster-only)
 */
export class ClaimManagerService {
	private static instance: ClaimManagerService;

	static getInstance(): ClaimManagerService {
		if (!ClaimManagerService.instance) {
			ClaimManagerService.instance = new ClaimManagerService();
		}
		return ClaimManagerService.instance;
	}

	// Regular client-side signing is disabled (paymaster-only)
	async claimWithRegularFlow(_lightningInvoice: LightningInvoice): Promise<ClaimResult> {
		return {
			success: false,
			message: 'Manual signing is disabled. Paymaster-only is enforced.'
		};
	}

	/**
	 * Claim payment using Starknet.js paymaster (gasless) - supports both commit and claim phases
	 */
	async claimWithPaymaster(
		lightningInvoice: LightningInvoice,
		user: UserWithCredentials
	): Promise<ClaimResult> {
		try {
			logger.info('Starting gasless Lightning swap claim process', {
				swapId: lightningInvoice.swapId
			});

			if (!user.webauthnCredentials) {
				throw new Error('User missing WebAuthn credentials');
			}

			// Use the new SwapOrchestrator with paymaster support
			const { SwapOrchestrator } = await import(
				'$lib/services/client/transaction/swap-orchestrator'
			);
			const orchestrator = new SwapOrchestrator();
			const result = await orchestrator.claimLightningSwapWithPaymaster(
				lightningInvoice.swapId,
				user
			);

			if (result.success) {
				logger.info('Gasless Lightning swap completed successfully!', {
					swapId: lightningInvoice.swapId,
					txHash: result.txHash,
					message: result.message
				});
				return {
					success: true,
					message: 'Lightning swap completed successfully with paymaster!',
					txHash: result.txHash
				};
			} else {
				logger.error('Gasless Lightning swap failed', {
					swapId: lightningInvoice.swapId,
					error: result.message,
					isNotCommittedError: result.message?.includes('Not committed'),
					shouldRetry: result.message?.includes('_finalize: Not committed')
				});
				return {
					success: false,
					message: result.message
				};
			}
		} catch (error) {
			const errorMsg = `Gasless Lightning swap error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			logger.error('Gasless Lightning swap error:', error);
			return {
				success: false,
				message: errorMsg
			};
		}
	}

	// Mixed approach is deprecated; always use paymaster path
	async claimWithCommitPaymaster(
		lightningInvoice: LightningInvoice,
		user: UserWithCredentials
	): Promise<ClaimResult> {
		return this.claimWithPaymaster(lightningInvoice, user);
	}
}

// Export singleton instance
export const claimManagerService = ClaimManagerService.getInstance();
