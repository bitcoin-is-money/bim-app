<script>
	import { goto } from '$app/navigation';
</script>

<button class="back-arrow" aria-label="Go back" on:click={() => goto('/')}>←</button>
<main class="about-bim">
	<h1>About Bim</h1>
	<p>
		Bim is a simple Bitcoin wallet on Starknet controlled by your phone. The keys never leave the
		Secure Enclave of your phone. Bim is a PWA so that we don't have to ask permission to Apple or
		Google for you to use it. Bim is open source.
	</p>
</main>
