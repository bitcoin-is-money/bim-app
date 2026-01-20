<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { PublicEnv } from '$lib/config/env';
	import { AuthService } from '$lib/services/client/auth.service';
	import { WebauthnService } from '$lib/services/client/webauthn.client.service';
	import { t } from 'svelte-i18n';

	let isLoading = false;
	let error = '';

	const rpId = PublicEnv.WEBAUTHN_RP_ID();
	const authService = AuthService.getInstance();
	const webauthnService = WebauthnService.getInstance();

	const handlePasskeyLogin = async () => {
		isLoading = true;
		error = '';
		try {
			const result = await authService.login();
			if (!result.success) {
				throw new Error(result.error || $t('auth.loginFailed'));
			}
		} catch (err) {
			error = err instanceof Error ? err.message : $t('auth.loginFailed');
		} finally {
			isLoading = false;
		}
	};
</script>

<section class="login-section">
	<h2>{$t('auth.signIn')}</h2>
	<p class="description">{$t('auth.description')}</p>
	<Button variant="success" loading={isLoading} on:click={handlePasskeyLogin}>
		{isLoading ? $t('auth.authenticating') : $t('auth.signIn')}
	</Button>
</section>

<style>
	.login-section {
		background: var(--color-surface);
		padding: 0.8rem;
		border-radius: var(--radius-md);
		max-width: 340px;
		margin: 0.8rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.8rem;
	}
	h2 {
		margin: 0 0 0.1rem 0;
		color: var(--color-text);
		font-size: 1.5rem;
		font-weight: 700;
		text-align: left;
	}
	.description {
		text-align: left;
		color: var(--color-text-light);
		font-size: 0.95rem;
		line-height: 1.5;
		margin: 0 0 0.2rem 0;
	}
	.login-section Button {
		align-self: flex-start;
		min-width: 120px;
	}
</style>
