<script lang="ts">
	import { currentUser } from '$lib/stores/auth';
	import LoginForm from './LoginForm.svelte';
	import RegisterForm from './RegisterForm.svelte';
	import UserProfile from './UserProfile.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';
	import { t } from 'svelte-i18n';
</script>

<UserProfile />

{#if !$currentUser}
	<div class="auth-container">
		<div class="login-card">
			<Card fullWidth class="card-short">
				<LoginForm />
			</Card>
		</div>
		<div class="auth-divider">
			<span class="auth-divider-line"></span>
			<span class="auth-divider-or">
				{typeof window === 'undefined' || $i18nReadyStore
					? $t('auth.orCreateAccount')
					: 'or create account'}
			</span>
			<span class="auth-divider-line"></span>
		</div>
		<div class="register-card">
			<Card fullWidth class="card-short">
				<RegisterForm />
			</Card>
		</div>
	</div>
{/if}

<style>
	.auth-container {
		max-width: 500px;
		margin: 0 auto;
		padding: 8px;
		border-radius: 16px;
	}
	@media (max-width: 767px) {
		.auth-container {
			max-width: none;
			margin: 0;
			padding: 15px;
		}
	}
	:global(.card.card-short) {
		padding-top: 0.2rem !important;
		padding-bottom: 0.2rem !important;
		padding-left: 1rem !important;
		padding-right: 1rem !important;
		margin-top: 0.2rem !important;
		margin-bottom: 0.2rem !important;
	}
	.login-card {
		margin-bottom: 1.2rem;
	}
	.auth-divider {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0.8rem 0;
		width: 100%;
	}
	.auth-divider-line {
		flex: 1;
		height: 1px;
		background: var(--color-border, #e5e7eb);
		margin: 0 0.5rem;
	}
	.auth-divider-or {
		color: var(--color-text-light, #cacaca);
		font-size: 0.95rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		padding: 0 0.2rem;
		text-transform: lowercase;
	}
</style>
