<!--
  @component
  Payment Claiming Component (Refactored)
  
  This component handles all transaction claiming logic using
  paymaster (gasless) transactions with WebAuthn integration.
  
  @prop lightningInvoice - The Lightning invoice to claim
  @prop swapStatus - Current swap status
  @prop paymasterSupported - Whether user's account supports paymaster
  @prop onClaimComplete - Callback when claiming completes successfully
  @prop onClaimError - Callback when claiming fails
  
  @deprecated Use imports from '$lib/services/client/lightning/' for new code
  @author bim
  @version 2.0.0
-->

<script lang="ts">
	import { AuthService } from '$lib/services/client/auth.service';
	import type { UnsignedTransaction } from '$lib/services/client/client-transaction.service';
	import {
		claimManagerService,
		transactionHandlerService,
		type TransactionPhase
	} from '$lib/services/client/lightning';
	import { criticalFlow } from '$lib/stores/navigation-guard';
	import { onDestroy } from 'svelte';
	import type { LightningInvoice, SwapStatus } from '$lib/services/client/lightning.client.service';
	import ClaimResult from './ClaimResult.svelte';
	import TransactionConfirmation from './TransactionConfirmation.svelte';
	import { t } from 'svelte-i18n';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';

	// Component props
	export let lightningInvoice: LightningInvoice | null = null;
	export let swapStatus: SwapStatus | null = null;
	export let onClaimComplete: (success: boolean, message: string) => void = () => {};
	export let onClaimError: (error: string) => void = () => {};

	// Component state
	let isClaiming = false;
	let claimMessage = '';
	let claimSuccess = false;
	let usePaymaster = true; // Always use gasless transactions for Lightning receives
	let showConfirmation = false;
	let pendingTransactions: UnsignedTransaction[] = [];
	let pendingPhase: TransactionPhase = 'commit';

	// Auto-claim state management
	let hasAttemptedAutoClaim = false;
	let previousSwapId: string | null = null;

	// Keep navigation locked while claiming is in progress
	$: criticalFlow.set(
		isClaiming
			? { active: true, reason: 'lightning-claim-in-progress', since: Date.now() }
			: { active: false }
	);

	onDestroy(() => {
		// Ensure we always release the lock if component unmounts
		criticalFlow.set({ active: false });
	});

	/**
	 * Main claim function - routes to appropriate claim method
	 */
	async function claimPayment() {
		console.log('🚀 ClaimingComponent.claimPayment started:', {
			lightningInvoice,
			usePaymaster,
			timestamp: new Date().toISOString()
		});

		if (!lightningInvoice) {
			console.error('❌ ClaimingComponent: No lightningInvoice provided');
			return;
		}

		isClaiming = true;
		claimMessage = '';
		claimSuccess = false;

		try {
			// Lightning receives always use gasless transactions (paymaster)
			const authService = AuthService.getInstance();
			const user = await authService.loadCurrentUser();

			if (!user) {
				throw new Error(
					$i18nReadyStore ? $t('processing.userNotAuthenticated') : 'User not authenticated'
				);
			}

			const result = await claimManagerService.claimWithPaymaster(lightningInvoice, user);

			claimMessage = result.message;
			claimSuccess = result.success;

			if (result.success) {
				onClaimComplete(true, result.message);

				// Update swap status
				if (swapStatus) {
					swapStatus = {
						...swapStatus,
						status: 'completed',
						lastUpdated: new Date().toISOString()
					};
				}
			} else {
				onClaimError(result.message);
			}
		} catch (error) {
			const errorMsg = $i18nReadyStore
				? $t('processing.claimError', {
						values: {
							error: error instanceof Error ? error.message : $t('processing.unknownErrorOccurred')
						}
					})
				: `Claim error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			claimMessage = errorMsg;
			claimSuccess = false;
			onClaimError(errorMsg);
		} finally {
			isClaiming = false;
			// Lock release handled by reactive statement above
		}
	}

	/**
	 * Auto-claim payment with safety checks
	 */
	async function autoClaimPayment() {
		console.log('🤖 ClaimingComponent.autoClaimPayment started:', {
			lightningInvoice,
			swapStatus: swapStatus?.status,
			hasAttemptedAutoClaim,
			timestamp: new Date().toISOString()
		});

		// Double-check all conditions before proceeding
		if (
			!lightningInvoice?.swapId ||
			!swapStatus ||
			swapStatus.status !== 'paid' ||
			hasAttemptedAutoClaim ||
			isClaiming
		) {
			console.log('🤖 Auto-claim conditions not met, aborting', {
				hasLightningInvoice: !!lightningInvoice?.swapId,
				hasSwapStatus: !!swapStatus,
				statusIsPaid: swapStatus?.status === 'paid',
				hasAttemptedAutoClaim,
				isClaiming
			});
			return;
		}

		// Mark that we've attempted auto-claim to prevent duplicates
		hasAttemptedAutoClaim = true;

		// Small delay to ensure UI updates properly
		setTimeout(async () => {
			try {
				await claimPayment();
				console.log('🤖 Auto-claim completed successfully');
			} catch (error) {
				console.error('🤖 Auto-claim failed:', error);
				// Reset flag on error so a retry could be possible if needed
				setTimeout(() => {
					hasAttemptedAutoClaim = false;
				}, 5000); // Allow retry after 5 seconds
			}
		}, 750); // 750ms delay for smooth UI transition
	}

	/**
	 * Handle transaction confirmation
	 */
	async function handleTransactionConfirm(
		event: CustomEvent<{ transactions: UnsignedTransaction[] }>
	) {
		if (!lightningInvoice) return;

		const result = await transactionHandlerService.submitSignedTransactions(
			lightningInvoice.swapId,
			pendingPhase,
			event.detail.transactions
		);

		if (result.success) {
			onClaimComplete(true, result.message);
		} else {
			onClaimError(result.message);
		}

		showConfirmation = false;
		pendingTransactions = [];
	}

	/**
	 * Handle transaction cancellation
	 */
	function handleTransactionCancel() {
		showConfirmation = false;
		pendingTransactions = [];
	}

	// Show claiming UI only when swap is paid and ready to claim
	$: showClaimingUI =
		lightningInvoice &&
		swapStatus &&
		(swapStatus.status === 'paid' || swapStatus.status === 'confirming');

	// Reset auto-claim flag when a new swap is detected
	$: if (lightningInvoice?.swapId) {
		// Reset auto-claim flag for new swaps
		const currentSwapId = lightningInvoice.swapId;
		if (currentSwapId !== previousSwapId) {
			console.log('🔄 ClaimingComponent: New swap detected, resetting auto-claim flag', {
				previousSwapId,
				currentSwapId
			});
			hasAttemptedAutoClaim = false;
			previousSwapId = currentSwapId;
		}
	}

	// Auto-claim reactive statement - trigger when payment is ready
	$: if (
		showClaimingUI &&
		!isClaiming &&
		!hasAttemptedAutoClaim &&
		swapStatus?.status === 'paid' &&
		lightningInvoice?.swapId
	) {
		console.log('🤖 ClaimingComponent: Auto-claiming payment');
		autoClaimPayment();
	}

	// Debug reactive statement
	$: {
		console.log('🔧 ClaimingComponent reactive update:', {
			lightningInvoice,
			swapStatus,
			showClaimingUI,
			hasAttemptedAutoClaim,
			shouldAutoClaim:
				showClaimingUI && !isClaiming && !hasAttemptedAutoClaim && swapStatus?.status === 'paid',
			lightningInvoiceValid: !!(lightningInvoice?.swapId && lightningInvoice?.invoice),
			swapStatusValid: !!swapStatus?.status,
			timestamp: new Date().toISOString()
		});
	}
</script>

{#if showClaimingUI}
	<div class="claiming-component">
		<div class="claim-section">
			<h4>🎉 {$i18nReadyStore ? $t('lightning.paymentReceived') : 'Payment Received!'}</h4>
			<p>
				{$i18nReadyStore
					? $t('lightning.paymentReceivedDescription')
					: 'Your Lightning payment has been received and is ready to claim.'}
			</p>
			<p class="gasless-info">
				✨ {$i18nReadyStore
					? $t('lightning.gaslessInfo')
					: 'This transaction will be gasless - no fees required!'}
			</p>

			<!-- Auto-claim status display -->
			<div class="auto-claim-status">
				{#if isClaiming}
					<div class="claiming-in-progress">
						<div class="loading-spinner">⚡</div>
						<span>
							{$i18nReadyStore
								? $t('lightning.autoClaimingGasless')
								: 'Auto-claiming your gasless payment...'}
						</span>
					</div>
				{:else if hasAttemptedAutoClaim && claimSuccess}
					<div class="claim-completed">
						<div class="success-icon">✅</div>
						<span>
							{$i18nReadyStore
								? $t('lightning.paymentClaimedSuccessfully')
								: 'Payment claimed successfully!'}
						</span>
					</div>
				{:else if hasAttemptedAutoClaim && !claimSuccess && claimMessage}
					<div class="claim-error">
						<div class="error-icon">❌</div>
						<span>{$i18nReadyStore ? $t('lightning.autoClaimFailed') : 'Auto-claim failed.'}</span>
						<button class="retry-claim-btn" on:click={() => claimPayment()}>
							{$i18nReadyStore ? $t('lightning.tryManualClaim') : 'Try Manual Claim'}
						</button>
					</div>
				{:else}
					<div class="preparing-claim">
						<div class="preparing-icon">🔄</div>
						<span>
							{$i18nReadyStore ? $t('lightning.preparingAutoClaim') : 'Preparing auto-claim...'}
						</span>
					</div>
				{/if}
			</div>

			<ClaimResult message={claimMessage} success={claimSuccess} />
		</div>
	</div>
{/if}

<!-- Transaction Confirmation Modal -->
<TransactionConfirmation
	transactions={pendingTransactions}
	swapId={lightningInvoice?.swapId || ''}
	phase={pendingPhase}
	isVisible={showConfirmation}
	on:confirm={handleTransactionConfirm}
	on:cancel={handleTransactionCancel}
/>

<style>
	.claiming-component {
		margin: 1.5rem 0;
	}

	.claim-section {
		padding: 1.5rem;
		background: linear-gradient(135deg, #1a1a2e 0%, #2d1b69 100%);
		border-radius: 12px;
		text-align: center;
		color: white;
	}

	.claim-section h4 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.claim-section p {
		margin: 0 0 1.5rem 0;
		opacity: 0.9;
	}

	.gasless-info {
		color: #4ade80 !important;
		font-weight: 500;
		opacity: 1 !important;
	}

	.auto-claim-status {
		margin: 1.5rem 0;
		text-align: center;
	}

	.claiming-in-progress,
	.claim-completed,
	.claim-error,
	.preparing-claim {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-radius: 12px;
		font-size: 1rem;
		font-weight: 500;
	}

	.claiming-in-progress {
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		color: #3b82f6;
	}

	.claim-completed {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.3);
		color: #22c55e;
	}

	.claim-error {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.preparing-claim {
		background: rgba(168, 85, 247, 0.1);
		border: 1px solid rgba(168, 85, 247, 0.3);
		color: #a855f7;
	}

	.loading-spinner {
		font-size: 1.2rem;
		animation: pulse 2s infinite;
	}

	.preparing-icon {
		font-size: 1.2rem;
		animation: spin 2s linear infinite;
	}

	.success-icon,
	.error-icon {
		font-size: 1.2rem;
	}

	.retry-claim-btn {
		background: #ef4444;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s ease;
		margin-left: 0.5rem;
	}

	.retry-claim-btn:hover {
		background: #dc2626;
	}

	.retry-claim-btn:active {
		background: #b91c1c;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 640px) {
		.claim-section {
			padding: 1rem;
		}

		.claiming-in-progress,
		.claim-completed,
		.claim-error,
		.preparing-claim {
			padding: 0.75rem 1rem;
			font-size: 0.9rem;
		}
	}
</style>
