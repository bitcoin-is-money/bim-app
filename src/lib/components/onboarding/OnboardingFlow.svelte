<script lang="ts">
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import { getInitializationStatus } from '$lib/i18n';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	export let onComplete: () => void = () => {};

	let currentStep = 0;
	let isVisible = false;
	let i18nReady = false;

	// Reactive progress percentage
	$: progressPercentage = ((currentStep + 1) / steps.length) * 100;

	// Make steps array reactive so it updates when translations are ready
	$: steps = [
		{
			title: $t('onboarding.bitcoinIsMoney'),
			description: $i18nReadyStore
				? $t('onboarding.meet_bim.description')
				: 'Bim is a minimalist app to receive and pay in Bitcoin. Bim goal is to be simple.',
			image: '₿',
			color: '#F69413'
		},
		{
			title: $t('onboarding.bimHasNothingToHide'),
			description: $i18nReadyStore
				? $t('onboarding.tech_proof.description')
				: 'Bim is source available, more info on our Github. We take a 0.01% fee on each payment.',
			image: '🌚',
			color: '#2196F3'
		},
		{
			title: $i18nReadyStore ? $t('onboarding.secured.title') : 'Bim is as secured as your phone.',
			description: $t('onboarding.noSecretToRemember'),
			image: '🔒',
			color: '#4CAF50'
		}
	];

	onMount(() => {
		// Check i18n initialization status
		i18nReady = getInitializationStatus();

		// Only show onboarding in browser environment and if not previously completed
		if (browser) {
			const onboardingCompleted = localStorage.getItem('bim-onboarding-completed');
			if (!onboardingCompleted) {
				isVisible = true;
			}
		}
	});

	function nextStep() {
		if (currentStep < steps.length - 1) {
			currentStep++;
		} else {
			completeOnboarding();
		}
	}

	function completeOnboarding() {
		isVisible = false;
		onComplete();
	}

	function dontShowAgain() {
		if (browser) {
			localStorage.setItem('bim-onboarding-completed', 'true');
		}
		completeOnboarding();
	}
</script>

{#if isVisible}
	<div class="onboarding-overlay">
		<div class="onboarding-container">
			<!-- Progress bar -->
			<div class="progress-container">
				<div class="progress-bar">
					<div class="progress-fill" style="width: {progressPercentage}%"></div>
				</div>
				<span class="progress-text">
					{$i18nReadyStore
						? $t('onboarding.progress', {
								values: { current: currentStep + 1, total: steps.length }
							})
						: `${currentStep + 1} of ${steps.length}`}
				</span>
			</div>

			<!-- Step content -->
			<div class="step-content">
				<div class="step-image" style="background-color: {steps[currentStep].color}">
					<span class="emoji">{steps[currentStep].image}</span>
				</div>

				<div class="step-text">
					<h1 class="step-title">{steps[currentStep].title}</h1>
					<p class="step-description">{steps[currentStep].description}</p>
				</div>
			</div>

			<!-- Navigation -->
			<div class="navigation">
				<Button variant="primary" on:click={nextStep}>
					{currentStep === steps.length - 1 ? $t('letsGo') : $t('next')}
				</Button>

				<!-- Don't show again button - only on step 3 -->
				{#if currentStep === steps.length - 1}
					<button class="dont-show-again-button" on:click={dontShowAgain}>
						{$t('dontShowAgain')}
					</button>
				{/if}
			</div>

			<!-- Step indicators -->
			<div class="step-indicators">
				{#each steps as _, index}
					<div
						class="indicator"
						class:active={index === currentStep}
						class:completed={index < currentStep}
					></div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.onboarding-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
		z-index: 99999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.onboarding-container {
		width: 100%;
		max-width: 400px;
		height: 100%;
		max-height: 600px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		position: relative;
	}

	.progress-container {
		position: absolute;
		top: 20px;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		background: rgba(0, 0, 0, 0.3);
		padding: 10px;
		border-radius: 8px;
		z-index: 1000;
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.progress-fill {
		height: 100%;
		background: #f69413;
		border-radius: 3px;
		transition: width 0.3s ease;
		min-width: 0%;
		max-width: 100%;
		box-shadow: 0 0 4px rgba(246, 148, 19, 0.5);
	}

	.progress-text {
		color: rgba(255, 255, 255, 0.7);
		font-size: 14px;
		font-weight: 500;
		min-width: 60px;
	}

	.skip-button {
		position: absolute;
		top: 20px;
		right: 0;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 16px;
		cursor: pointer;
		padding: 8px 12px;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.skip-button:hover {
		color: rgba(255, 255, 255, 0.9);
		background: rgba(255, 255, 255, 0.1);
	}

	.step-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 40px 20px;
	}

	.step-image {
		width: 120px;
		height: 120px;
		border-radius: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 40px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}

	.emoji {
		font-size: 48px;
	}

	.step-text {
		max-width: 320px;
	}

	.step-title {
		font-size: 32px;
		font-weight: 700;
		color: white;
		margin: 0 0 8px 0;
		line-height: 1.2;
	}

	.step-subtitle {
		font-size: 18px;
		font-weight: 600;
		color: var(--color-primary, #f69413);
		margin: 0 0 16px 0;
		line-height: 1.3;
	}

	.step-description {
		font-size: 16px;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;
		margin: 0;
	}

	.navigation {
		width: 100%;
		padding: 20px 0;
	}

	.dont-show-again-button {
		background: none;
		border: none;
		color: white;
		text-decoration: underline;
		font-size: 14px;
		cursor: pointer;
		padding: 16px 24px;
		margin-top: 24px;
		opacity: 0.7;
		transition: opacity 0.2s ease;
	}

	.dont-show-again-button:hover {
		opacity: 1;
	}

	.next-button {
		width: 100%;
		height: 56px;
		font-size: 18px;
		font-weight: 600;
	}

	.step-indicators {
		display: flex;
		gap: 8px;
		margin-bottom: 20px;
	}

	.indicator {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.3);
		transition: all 0.3s ease;
	}

	.indicator.active {
		background: var(--color-primary, #f69413);
		transform: scale(1.2);
	}

	.indicator.completed {
		background: rgba(255, 255, 255, 0.6);
	}

	/* Mobile optimizations */
	@media (max-width: 480px) {
		.onboarding-container {
			max-height: none;
			height: 100vh;
		}

		.step-title {
			font-size: 28px;
		}

		.step-subtitle {
			font-size: 16px;
		}

		.step-description {
			font-size: 15px;
		}

		.step-image {
			width: 100px;
			height: 100px;
			border-radius: 50px;
		}

		.emoji {
			font-size: 40px;
		}
	}
</style>
