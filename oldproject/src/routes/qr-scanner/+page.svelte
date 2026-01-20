<!--
  @component
  QR Scanner Route
  
  This route handles requests to /qr-scanner and redirects to the main app
  where the QR scanner modal is available.
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		// Redirect to main app where QR scanner modal is available
		goto('/');
	});
</script>

<svelte:head>
	<title>QR Scanner - BIM</title>
	<meta name="description" content="QR Scanner for BIM" />
</svelte:head>

<main>
	<div class="redirect-container">
		<h1>QR Scanner</h1>
		<p>Redirecting to main app...</p>
		<p>
			If you're not redirected automatically, <a href="/">click here</a>
			.
		</p>
	</div>
</main>

<style>
	.redirect-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		text-align: center;
		padding: 2rem;
	}

	h1 {
		color: #333;
		margin-bottom: 1rem;
	}

	p {
		color: #666;
		margin-bottom: 0.5rem;
	}

	a {
		color: #007bff;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
