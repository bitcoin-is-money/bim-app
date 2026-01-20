<script lang="ts">
	import { goto } from '$app/navigation';
	import { logout } from '$lib/stores/auth';
	let currentLocale = 'en';
	let showFaq = false;
	let showSupport = false;

	async function handleLanguageChange(newLocale: string) {
		currentLocale = newLocale;
		document.cookie = `lang=${newLocale}; Path=/; max-age=${60 * 60 * 24 * 365}`;
		// Reload page to apply language change
		window.location.reload();
	}

	function toggleFaq() {
		showFaq = !showFaq;
		if (showSupport) showSupport = false; // Close support if FAQ is opened
	}

	function toggleSupport() {
		showSupport = !showSupport;
		if (showFaq) showFaq = false; // Close FAQ if support is opened
	}
</script>

<button class="back-arrow" aria-label="Go back" on:click={() => goto('/')}>
	<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path
			d="M19 12H5M12 19L5 12L12 5"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
</button>

<main class="settings">
	<h1>Settings</h1>

	<div class="language-selector">
		<label for="language-select">Language:</label>
		<select
			id="language-select"
			value={currentLocale}
			on:change={(e) => handleLanguageChange((e.target as HTMLSelectElement).value)}
		>
			<option value="en">English</option>
			<option value="fr">Français</option>
		</select>
	</div>

	<div class="menu">
		<button class="menu-item" on:click={toggleFaq}>
			<span>FAQ</span>
			<span class:rotated={showFaq}>→</span>
		</button>

		{#if showFaq}
			<div class="faq-dropdown">
				<div class="faq-section">
					<h3>General</h3>
					<div class="faq-item">
						<h4>What is Bim?</h4>
						<p>
							Bim is a minimalist wallet, to pay and receive in bitcoin, built on Starknet. Bim is
							seedless, it uses passkeys to authenticate users.
						</p>
						<p>
							<a
								href="https://starknet.io"
								class="faq-link"
								target="_blank"
								rel="noopener noreferrer"
							>
								Learn more about Starknet.
							</a>
						</p>
					</div>
					<div class="faq-item">
						<h4>Who is building Bim?</h4>
						<p>3 Bitcoin enthusiasts and tech lovers.</p>
					</div>
					<div class="faq-item">
						<h4>What's happening if we stop running Bim or we disappear?</h4>
						<p>You won't be able to access your funds anymore (no one will be).</p>
						<p>To prevent that:</p>
						<ul>
							<li>
								We strongly recommend to use Bim as a payment service, but not as a vault. You
								should transfer your funds to a safer wallet in case you receive a lot of payments.
							</li>
							<li>
								Bim's code is source available, it means that if someday we don't operate Bim
								anymore, someone could build a clone easily.
							</li>
						</ul>
					</div>
					<div class="faq-item">
						<h4>What are the fees?</h4>
						<p>0,2% on every sending transactions. That's it.</p>
					</div>
					<div class="faq-item">
						<h4>Can I buy bitcoins from Bim?</h4>
						<p>
							No, Bim can't help you with that. Bim is focused on Bitcoin transactions only and
							don't deal directly with fiat currencies.
						</p>
					</div>
				</div>
				<div class="faq-section">
					<h3>Payments</h3>
					<div class="faq-item">
						<h4>How can I make my first payment with BIM?</h4>
						<p>
							BIM does not allow you to directly trade FIAT for Bitcoins. So you have to top up your
							BIM wallet from another Bitcoin wallet you have : Ledger, Phoenix, Braavos etc. To do
							so, just create an invoice using BIM and pay it from your other wallet. Once you have
							a positive balance on your BIM wallet, you can start making payments.
						</p>
					</div>
					<div class="faq-item">
						<h4>Is there a minimum receiving amount?</h4>
						<p>Only when receiving from Lightning, 1k sats minimum.</p>
					</div>
					<div class="faq-item">
						<h4>How private are my payments on Bim?</h4>
						<p>
							They are only pseudonymous, we don't know who you are but the transfer are recorded
							clear on the blockchain. We are looking into to improve this aspect of the solution.
						</p>
					</div>
					<div class="faq-item">
						<h4>Can I cancel a pending payment on Bim?</h4>
						<p>No, each transaction you signed is broadcasted and irreversible.</p>
					</div>
				</div>
				<div class="faq-section">
					<h3>Troubleshooting</h3>
					<div class="faq-item">
						<h4>I've lost my phone, what can I do?</h4>
						<p>
							Not much, except if you backup your passkey before. That's why we strongly recommend
							to only use Bim as day to day wallet, not a long term vault.
						</p>
					</div>
					<div class="faq-item">
						<h4>Receiving or paying with Bim keeps failing, what can I do?</h4>
						<p>
							Bim needs a reliable connection to work properly. Make sure you wifi or 4G/5G is
							stable and well configured.
						</p>
					</div>
					<div class="faq-item">
						<h4>How to contact us?</h4>
						<p>
							Contact us of any inquiries @ <a href="mailto:bimapp@protonmail.com" class="faq-link">
								bimapp@protonmail.com
							</a>
						</p>
					</div>
				</div>
			</div>
		{/if}

		<button class="menu-item" on:click={toggleSupport}>
			<span>Support Bim</span>
			<span class:rotated={showSupport}>→</span>
		</button>

		{#if showSupport}
			<div class="faq-dropdown">
				<div class="faq-section">
					<h3>Support Bim</h3>
					<div class="faq-item">
						<p>
							We build Bim and run it just because using a bitcoin centric app with a good UX, low
							fees and code available is lit. That being said, it represents hundreds hours of work.
							If you want to support it and show Bim some love you can donate here (bitcoin only of
							course :) :
						</p>
						<p class="donation-address">address</p>
					</div>
				</div>
			</div>
		{/if}
		<button class="menu-item" on:click={() => logout()}>
			<span>Log Out</span>
			<span>→</span>
		</button>
	</div>
</main>

<style>
	.settings {
		width: 100vw;
		height: 100vh;
		padding: 2rem;
		background: var(--color-background, #121413);
		display: flex;
		flex-direction: column;
		align-items: center;
		position: fixed;
		top: 0;
		left: 0;
		overflow: hidden;
	}

	.back-arrow {
		position: absolute;
		top: 2rem;
		left: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: #ffffff;
		cursor: pointer;
		z-index: 1000;
		transition: all 0.2s ease;
	}

	.back-arrow:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.back-arrow:focus {
		outline: 2px solid var(--color-primary, #f69413);
		outline-offset: 2px;
	}

	.back-arrow svg {
		width: 24px;
		height: 24px;
	}

	h1 {
		color: var(--color-text, #fff);
		margin: 2rem 0;
	}

	.language-selector {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: var(--color-surface, #1a1a1a);
		border-radius: 12px;
		width: 100%;
		max-width: 400px;
	}

	.language-selector label {
		color: var(--color-text-secondary, #bbb);
	}

	select {
		background: var(--color-surface-secondary, #2a2a2a);
		color: var(--color-text, #fff);
		border: 1px solid var(--color-border, #444);
		border-radius: 8px;
		padding: 0.75rem;
		font-size: 1rem;
		cursor: pointer;
	}

	select:focus {
		outline: none;
		border-color: var(--color-primary, #f69413);
	}

	.menu {
		width: 100%;
		max-width: 400px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.menu-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		background: var(--color-surface, #1a1a1a);
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		width: 100%;
	}

	.menu-item:hover {
		background: var(--color-surface-variant, #2a2a2a);
		border: 1px solid var(--color-primary, #f69413);
	}

	.menu-item span:first-child {
		color: var(--color-text, #fff);
	}

	.menu-item span:last-child {
		color: var(--color-text-secondary, #bbb);
		transition: transform 0.2s ease;
	}

	.menu-item span:last-child.rotated {
		transform: rotate(90deg);
	}

	.faq-dropdown {
		background: var(--color-surface-secondary, #2a2a2a);
		border-radius: 12px;
		margin: 0.5rem 0;
		padding: 1rem;
		animation: slideDown 0.2s ease-out;
	}

	.faq-section {
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--color-border, #444);
	}

	.faq-section:last-child {
		border-bottom: none;
	}

	.faq-section h3 {
		color: var(--color-text, #fff);
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
	}

	.faq-item {
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-border, #444);
	}

	.faq-item:last-child {
		border-bottom: none;
		margin-bottom: 0;
	}

	.faq-item h4 {
		color: var(--color-primary, #f69413);
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
	}

	.faq-item p {
		color: var(--color-text-secondary, #bbb);
		font-size: 0.875rem;
		line-height: 1.5;
		margin: 0 0 0.5rem 0;
	}

	.faq-item ul {
		color: var(--color-text-secondary, #bbb);
		font-size: 0.875rem;
		line-height: 1.5;
		margin: 0.5rem 0;
		padding-left: 1.2rem;
	}

	.faq-item li {
		margin-bottom: 0.5rem;
	}

	.faq-link {
		color: var(--color-primary, #f69413);
		text-decoration: none;
		font-weight: 500;
	}

	.faq-link:hover {
		text-decoration: underline;
	}

	.donation-address {
		color: var(--color-primary, #f69413);
		font-family: monospace;
		font-size: 0.875rem;
		font-weight: 600;
		background: var(--color-surface, #1a1a1a);
		padding: 0.75rem;
		border-radius: 8px;
		border: 1px solid var(--color-border, #444);
		margin: 1rem 0 0 0;
		word-break: break-all;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 767px) {
		.settings {
			padding: 1rem;
		}

		h1 {
			font-size: 1.75rem;
		}

		.back-arrow {
			top: 1.5rem;
			left: 1rem;
			width: 36px;
			height: 36px;
		}

		.back-arrow svg {
			width: 20px;
			height: 20px;
		}
	}
</style>
