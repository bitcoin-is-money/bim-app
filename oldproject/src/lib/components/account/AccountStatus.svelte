<script lang="ts">
	import type { AccountStatus } from '$lib/services/client/webauthn-account.service';
	import LightningReceive from '$lib/components/lightning/LightningReceive.svelte';

	export let status: AccountStatus;
	export let onPaymentComplete: (status: any) => void = () => {};
	export let onPaymentError: (error: string) => void = () => {};
</script>

<div class="account-deployed">
	<h3>✅ Account Already Deployed</h3>
	<div class="account-info">
		<div class="info-item">
			<strong>Account Address:</strong>
			<div class="address-value">{status.address}</div>
		</div>
		<div class="info-item">
			<strong>Balance:</strong>
			<div class="balance-value">{status.balance || 'Balance unavailable'}</div>
		</div>
		<div class="info-item">
			<strong>Status:</strong>
			<div class="status-active">🟢 Active</div>
		</div>
	</div>

	<!-- Lightning Bitcoin Receive Section -->
	<div class="lightning-section">
		<h4>💰 Receive Bitcoin via Lightning</h4>
		<p class="lightning-description">
			Receive Bitcoin from Lightning Network and automatically swap to Starknet assets.
		</p>

		<LightningReceive
			starknetAddress={status.address}
			{onPaymentComplete}
			onError={onPaymentError}
		/>
	</div>
</div>

<style>
	.account-deployed {
		background: #1a4a1a;
		padding: 24px;
		border-radius: 8px;
		border: 1px solid #2d5a2d;
		text-align: center;
	}

	.account-deployed h3 {
		margin-top: 0;
		color: #4ade80;
	}

	.account-info {
		background: #1e1e1e;
		padding: 16px;
		border-radius: 6px;
		margin: 16px 0;
		text-align: left;
		border: 1px solid #404040;
	}

	.info-item {
		margin-bottom: 12px;
	}

	.info-item:last-child {
		margin-bottom: 0;
	}

	.info-item strong {
		display: block;
		margin-bottom: 4px;
		color: #ffffff;
		font-size: 14px;
	}

	.address-value {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 12px;
		background: #121212;
		padding: 8px;
		border-radius: 4px;
		word-break: break-all;
		color: #b0b0b0;
		border: 1px solid #404040;
	}

	.balance-value {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 16px;
		font-weight: 600;
		background: #121212;
		padding: 8px;
		border-radius: 4px;
		color: #4ade80;
		border: 1px solid #404040;
	}

	.status-active {
		font-size: 14px;
		font-weight: 600;
		color: #4ade80;
		background: #1a4a1a;
		padding: 4px 8px;
		border-radius: 4px;
		display: inline-block;
	}

	/* Lightning section styles */
	.lightning-section {
		margin-top: 24px;
		padding: 20px;
		background: #1a2f4a;
		border: 2px solid #2a5a7a;
		border-radius: 8px;
	}

	.lightning-section h4 {
		margin: 0 0 12px 0;
		color: #60a5fa;
		font-size: 18px;
		text-align: center;
	}

	.lightning-description {
		color: #b0d0f0;
		font-size: 14px;
		line-height: 1.5;
		text-align: center;
		margin-bottom: 16px;
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.account-deployed {
			padding: 16px;
			margin: 12px 0;
		}

		.account-deployed h3 {
			font-size: 18px;
			margin-bottom: 12px;
		}

		.account-info {
			padding: 12px;
			margin: 12px 0;
		}

		.info-item strong {
			font-size: 15px;
		}

		.address-value {
			font-size: 11px;
			padding: 6px;
			word-break: break-all;
			overflow-wrap: break-word;
			line-height: 1.4;
		}

		.balance-value {
			font-size: 15px;
			padding: 6px;
		}

		.lightning-section {
			margin-top: 16px;
			padding: 16px;
		}

		.lightning-section h4 {
			font-size: 16px;
			margin-bottom: 8px;
		}

		.lightning-description {
			font-size: 13px;
			margin-bottom: 12px;
		}
	}
</style>
