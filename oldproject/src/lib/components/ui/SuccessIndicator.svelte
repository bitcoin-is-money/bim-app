<!--
  @component
  Success Indicator Component
  
  Displays an animated green checkmark that appears for 2 seconds
  to indicate successful completion of an operation.
  
  @prop visible - Controls when the indicator is shown
  @prop message - Optional success message to display (default: "Success!")
  @prop position - Position on screen: 'center' | 'top' | 'bottom' (default: 'center')
  @prop onHide - Callback fired when indicator auto-hides
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';

	// Component props
	export let visible = false;
	export let message = 'Success!';
	export let position: 'center' | 'top' | 'bottom' = 'center';
	export let onHide: () => void = () => {};

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Internal state
	let showIndicator = false;
	let animationPhase: 'entering' | 'visible' | 'exiting' = 'entering';
	let hideTimeout: NodeJS.Timeout | null = null;

	// Handle visibility changes
	$: {
		console.log('🔍 SuccessIndicator: visible prop changed:', {
			visible,
			showIndicator,
			willTrigger: visible && !showIndicator
		});
		if (visible && !showIndicator) {
			console.log('🚀 SuccessIndicator: Triggering showSuccessIndicator');
			showSuccessIndicator();
		} else if (!visible && showIndicator) {
			console.log('🛑 SuccessIndicator: visible=false, forcing hide');
			showIndicator = false;
			if (hideTimeout) {
				clearTimeout(hideTimeout);
			}
		}
	}

	/**
	 * Show the success indicator with animations
	 */
	function showSuccessIndicator() {
		console.log('🎬 SuccessIndicator: showSuccessIndicator called');

		if (hideTimeout) {
			console.log('🧹 SuccessIndicator: Clearing existing timeout');
			clearTimeout(hideTimeout);
		}

		console.log('✨ SuccessIndicator: Setting showIndicator = true, phase = entering');
		showIndicator = true;
		animationPhase = 'entering';

		// Phase 1: Enter animation
		setTimeout(() => {
			console.log('🎯 SuccessIndicator: Phase 1 - Setting phase = visible');
			animationPhase = 'visible';
		}, 50);

		// Phase 2: Stay visible for 1.8 seconds, then exit
		hideTimeout = setTimeout(() => {
			console.log('🚪 SuccessIndicator: Phase 2 - Setting phase = exiting');
			animationPhase = 'exiting';

			// Phase 3: Exit animation
			setTimeout(() => {
				console.log('👋 SuccessIndicator: Phase 3 - Hiding indicator');
				showIndicator = false;
				animationPhase = 'entering';
				onHide();
				dispatch('hide');
			}, 300);
		}, 1700); // Show for 1.7s + 0.3s exit = 2.0s total
	}

	// Cleanup on destroy
	onMount(() => {
		console.log('🎬 SuccessIndicator: Component mounted');
		return () => {
			console.log('🔥 SuccessIndicator: Component unmounting');
			if (hideTimeout) {
				clearTimeout(hideTimeout);
			}
		};
	});
</script>

{#if showIndicator}
	{console.log('🎨 SuccessIndicator: RENDERING with showIndicator=true, phase=', animationPhase)}
	<div
		class="success-indicator"
		class:center={position === 'center'}
		class:top={position === 'top'}
		class:bottom={position === 'bottom'}
		class:entering={animationPhase === 'entering'}
		class:visible={animationPhase === 'visible'}
		class:exiting={animationPhase === 'exiting'}
		role="alert"
		aria-live="polite"
		aria-label={message}
		style="--debug-visible: {showIndicator ? '1' : '0'}; --debug-phase: '{animationPhase}'"
	>
		<div class="indicator-content">
			<div class="checkmark-container">
				<svg
					class="checkmark"
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<circle class="checkmark-circle" cx="12" cy="12" r="10" fill="currentColor" />
					<path
						class="checkmark-check"
						d="M8 12l2 2 4-4"
						stroke="white"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						fill="none"
					/>
				</svg>
			</div>
			<div class="success-message">{message}</div>
		</div>
	</div>
{/if}

<style>
	.success-indicator {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		z-index: 99999; /* Increased from 9999 to ensure it's above everything */
		pointer-events: none;
		user-select: none;
		isolation: isolate; /* Create new stacking context */
	}

	.success-indicator.center {
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.success-indicator.top {
		top: 20%;
		transform: translateX(-50%);
	}

	.success-indicator.bottom {
		bottom: 20%;
		transform: translateX(-50%);
	}

	.indicator-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		background: rgba(255, 255, 255, 0.98); /* Increased opacity */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px); /* Safari support */
		border-radius: 20px;
		padding: 1.5rem 2rem;
		box-shadow:
			0 10px 40px rgba(76, 175, 80, 0.3),
			0 4px 20px rgba(0, 0, 0, 0.1),
			0 0 0 1px rgba(76, 175, 80, 0.1); /* Additional border shadow */
		border: 1px solid rgba(76, 175, 80, 0.2);
		/* Ensure content is on top */
		position: relative;
		z-index: 1;
	}

	.checkmark-container {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.checkmark {
		width: 48px;
		height: 48px;
		color: #4caf50;
		filter: drop-shadow(0 2px 8px rgba(76, 175, 80, 0.3));
	}

	.success-message {
		font-size: 1rem;
		font-weight: 600;
		color: #2e7d32;
		text-align: center;
		letter-spacing: 0.02em;
	}

	/* Animation states */
	.success-indicator.entering {
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.8);
	}

	.success-indicator.entering .checkmark-container {
		transform: scale(0.5);
	}

	.success-indicator.visible {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
		transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.success-indicator.visible .checkmark-container {
		transform: scale(1);
		transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.success-indicator.visible .checkmark-check {
		animation: drawCheck 0.6s ease-in-out forwards;
		stroke-dasharray: 12;
		stroke-dashoffset: 12;
	}

	.success-indicator.visible .checkmark-circle {
		animation: fillCircle 0.4s ease-in-out forwards;
	}

	.success-indicator.exiting {
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.9);
		transition: all 0.3s ease-in-out;
	}

	/* Position-specific entering states */
	.success-indicator.top.entering {
		transform: translateX(-50%) scale(0.8);
	}

	.success-indicator.top.visible {
		transform: translateX(-50%) scale(1);
	}

	.success-indicator.top.exiting {
		transform: translateX(-50%) scale(0.9);
	}

	.success-indicator.bottom.entering {
		transform: translateX(-50%) scale(0.8);
	}

	.success-indicator.bottom.visible {
		transform: translateX(-50%) scale(1);
	}

	.success-indicator.bottom.exiting {
		transform: translateX(-50%) scale(0.9);
	}

	/* Checkmark animations */
	@keyframes drawCheck {
		0% {
			stroke-dashoffset: 12;
		}
		100% {
			stroke-dashoffset: 0;
		}
	}

	@keyframes fillCircle {
		0% {
			transform: scale(0);
			opacity: 0;
		}
		50% {
			transform: scale(1.1);
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Mobile optimizations */
	@media (max-width: 640px) {
		.indicator-content {
			padding: 1.25rem 1.75rem;
			border-radius: 16px;
		}

		.checkmark {
			width: 40px;
			height: 40px;
		}

		.success-message {
			font-size: 0.9rem;
		}

		.success-indicator.top {
			top: 15%;
		}

		.success-indicator.bottom {
			bottom: 15%;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.indicator-content {
			background: rgba(18, 20, 19, 0.95);
			border-color: rgba(76, 175, 80, 0.3);
		}

		.success-message {
			color: #81c784;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.success-indicator,
		.success-indicator * {
			animation-duration: 0.2s !important;
			transition-duration: 0.2s !important;
		}

		.checkmark-check {
			animation: none;
			stroke-dasharray: none;
			stroke-dashoffset: 0;
		}

		@keyframes fillCircle {
			0% {
				transform: scale(1);
				opacity: 1;
			}
			100% {
				transform: scale(1);
				opacity: 1;
			}
		}
	}

	/* High contrast mode */
	@media (prefers-contrast: high) {
		.indicator-content {
			background: white;
			border: 2px solid #4caf50;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		}

		.success-message {
			color: #2e7d32;
		}
	}
</style>
