<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import type { UnsignedTransaction } from '$lib/services/client/client-transaction.service';
	import { createEventDispatcher } from 'svelte';

	export let transactions: UnsignedTransaction[] = [];
	export let swapId: string = '';
	export let phase: 'commit' | 'claim' | 'commit-and-claim' = 'commit';
	export let isVisible: boolean = false;

	const dispatch = createEventDispatcher<{
		confirm: { transactions: UnsignedTransaction[] };
		cancel: void;
	}>();

	function handleConfirm() {
		dispatch('confirm', { transactions });
	}

	function handleCancel() {
		dispatch('cancel');
	}

	function getPhaseDescription(): string {
		switch (phase) {
			case 'commit':
				return 'Commit Phase - Preparing the swap transaction';
			case 'claim':
				return 'Claim Phase - Claiming your tokens';
			case 'commit-and-claim':
				return 'One-Shot - Committing and claiming in a single transaction';
			default:
				return 'Transaction Phase';
		}
	}

	function getTransactionSummary(): string {
		const invokeCount = transactions.filter((tx) => tx.type === 'INVOKE').length;
		const deployCount = transactions.filter((tx) => tx.type === 'DEPLOY_ACCOUNT').length;

		const parts = [];
		if (invokeCount > 0)
			parts.push(`${invokeCount} invoke transaction${invokeCount > 1 ? 's' : ''}`);
		if (deployCount > 0)
			parts.push(`${deployCount} account deployment transaction${deployCount > 1 ? 's' : ''}`);

		return parts.join(', ');
	}
</script>

{#if isVisible}
	<div class="transaction-confirmation-overlay">
		<div class="transaction-confirmation-modal">
			<Card>
				<div class="confirmation-header">
					<h3>Confirm Transaction Signing</h3>
					<p class="phase-description">{getPhaseDescription()}</p>
				</div>

				<div class="transaction-details">
					<div class="detail-row">
						<span class="label">Swap ID:</span>
						<span class="value">{swapId}</span>
					</div>
					<div class="detail-row">
						<span class="label">Transactions:</span>
						<span class="value">{getTransactionSummary()}</span>
					</div>
					<div class="detail-row">
						<span class="label">Total Count:</span>
						<span class="value">{transactions.length}</span>
					</div>
				</div>

				<div class="transaction-list">
					<h4>Transaction Details:</h4>
					{#each transactions as tx, index}
						<div class="transaction-item">
							<div class="transaction-header">
								<span class="transaction-number">#{index + 1}</span>
								<span class="transaction-type">{tx.type}</span>
							</div>
							{#if tx.details}
								<div class="transaction-details">
									<pre>{JSON.stringify(tx.details, null, 2)}</pre>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<div class="confirmation-actions">
					<Button variant="secondary" size="medium" on:click={handleCancel}>Cancel</Button>
					<Button variant="primary" size="medium" on:click={handleConfirm}>
						Sign Transactions
					</Button>
				</div>
			</Card>
		</div>
	</div>
{/if}

<style>
	.transaction-confirmation-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.transaction-confirmation-modal {
		max-width: 600px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
	}

	.confirmation-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.confirmation-header h3 {
		margin: 0 0 0.5rem 0;
		color: var(--text-primary);
	}

	.phase-description {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.transaction-details {
		margin-bottom: 1.5rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border-color);
	}

	.label {
		font-weight: 600;
		color: var(--text-primary);
	}

	.value {
		color: var(--text-secondary);
		font-family: monospace;
	}

	.transaction-list {
		margin-bottom: 1.5rem;
	}

	.transaction-list h4 {
		margin: 0 0 1rem 0;
		color: var(--text-primary);
	}

	.transaction-item {
		margin-bottom: 1rem;
		padding: 1rem;
		border: 1px solid var(--border-color);
		border-radius: 0.5rem;
		background: var(--background-secondary);
	}

	.transaction-header {
		display: flex;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.transaction-number {
		background: var(--primary-color);
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.8rem;
		margin-right: 0.5rem;
	}

	.transaction-type {
		font-weight: 600;
		color: var(--text-primary);
	}

	.transaction-details pre {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-secondary);
		background: var(--background-primary);
		padding: 0.5rem;
		border-radius: 0.25rem;
		overflow-x: auto;
	}

	.confirmation-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}
</style>
