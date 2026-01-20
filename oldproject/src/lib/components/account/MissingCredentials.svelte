<script lang="ts">
	import type { User } from '$lib/db';

	export let user: User;
</script>

<div class="missing-credentials">
	<h3>⚠️ Incomplete Account Setup</h3>
	<p>Your account is missing the required WebAuthn credentials needed for Starknet deployment.</p>
	<p>This typically happens if your account was created before our recent security updates.</p>

	<div class="missing-info">
		<div><strong>Missing:</strong></div>
		<ul>
			{#if !user.credentialId}<li>Credential ID</li>{/if}
			{#if !user.publicKey}<li>Public Key</li>{/if}
		</ul>
	</div>

	<div class="resolution-options">
		<h4>To deploy your Starknet account:</h4>
		<ol>
			<li>
				<strong>Create a new account</strong>
				with the same username (if available)
			</li>
			<li>
				<strong>Register a new passkey</strong>
				to get the required credentials
			</li>
			<li>
				<strong>Then return here</strong>
				to deploy your Starknet account
			</li>
		</ol>
	</div>
</div>

<style>
	.missing-credentials {
		background: #4a3a1a;
		color: #fbbf24;
		padding: 20px;
		border: 1px solid #7a5a2a;
		border-radius: 8px;
		text-align: left;
	}

	.missing-credentials h3 {
		margin-top: 0;
		color: #fbbf24;
	}

	.missing-credentials p {
		margin-bottom: 16px;
		line-height: 1.5;
	}

	.missing-info {
		background: #1e1e1e;
		padding: 12px;
		border-radius: 6px;
		margin: 16px 0;
		border: 1px solid #404040;
	}

	.missing-info ul {
		margin: 8px 0 0 20px;
		color: #fca5a5;
	}

	.resolution-options {
		background: #1e1e1e;
		padding: 16px;
		border-radius: 6px;
		margin-top: 16px;
		border: 1px solid #404040;
	}

	.resolution-options h4 {
		margin-top: 0;
		color: #ffffff;
	}

	.resolution-options ol {
		margin: 12px 0 0 20px;
		line-height: 1.6;
	}

	.resolution-options li {
		margin-bottom: 8px;
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.missing-credentials {
			padding: 16px;
			margin: 12px 0;
		}

		.missing-credentials h3 {
			font-size: 18px;
			margin-bottom: 12px;
		}

		.resolution-options {
			padding: 12px;
			margin-top: 12px;
		}

		.resolution-options ol {
			margin: 8px 0 0 16px;
		}
	}
</style>
