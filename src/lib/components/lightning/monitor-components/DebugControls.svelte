<script lang="ts">
	export let startMonitoring: () => void;
	export let stopMonitoring: () => void;
	export let pauseMonitoring: () => void;
	export let resumeMonitoring: () => void;
	export let manualPoll: () => void;
	export let canStart: boolean;
	export let canStop: boolean;
	export let canPause: boolean;
	export let canResume: boolean;
	export let lastApiResponse: any;
</script>

<div class="debug-controls">
	<h4>Debug Controls</h4>
	<div class="control-buttons">
		<button class="debug-btn" on:click={startMonitoring} disabled={!canStart}>Start</button>
		<button class="debug-btn" on:click={stopMonitoring} disabled={!canStop}>Stop</button>
		<button class="debug-btn" on:click={pauseMonitoring} disabled={!canPause}>Pause</button>
		<button class="debug-btn" on:click={resumeMonitoring} disabled={!canResume}>Resume</button>
		<button class="debug-btn" on:click={manualPoll} disabled={!canStop}>Poll Now</button>
	</div>

	{#if lastApiResponse}
		<div class="api-response">
			<h5>Last API Response:</h5>
			<pre>{JSON.stringify(lastApiResponse, null, 2)}</pre>
		</div>
	{/if}
</div>

<style>
	.debug-controls {
		border-top: 1px solid #e2e8f0;
		padding-top: 12px;
		margin-top: 12px;
	}

	.debug-controls h4 {
		margin: 0 0 8px 0;
		font-size: 14px;
		color: #f59e0b;
		font-weight: 600;
	}

	.control-buttons {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}

	.debug-btn {
		padding: 4px 8px;
		font-size: 12px;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: white;
		color: #374151;
		cursor: pointer;
		transition: all 0.2s;
	}

	.debug-btn:hover:not(:disabled) {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.debug-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.api-response {
		font-size: 12px;
	}

	.api-response h5 {
		margin: 0 0 4px 0;
		color: #6b7280;
	}

	.api-response pre {
		background: white;
		padding: 8px;
		border-radius: 4px;
		border: 1px solid #e2e8f0;
		overflow-x: auto;
		max-height: 200px;
		margin: 0;
	}
</style>
