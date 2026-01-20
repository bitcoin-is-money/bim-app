<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { useAccountDeployment } from '$lib/composables/useAccountDeployment';

	import { PaymentService } from '$lib/services/client/payment.service';
	import { PricingOrchestrator } from '$lib/services/client/pricing/pricing-orchestrator';
	import type { PriceData } from '$lib/services/client/pricing/types';
	import type { SupportedCurrency } from '$lib/services/server/user-settings.service';
	import { currentUser } from '$lib/stores/auth';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';

	// Reactive helper to safely get translation or fallback
	$: safeTranslation = (key: string, fallback: string): string => {
		if (!$i18nReadyStore) return fallback;
		try {
			const translation = $t(key);
			// If translation returns the key itself, it means translation failed
			return translation === key ? fallback : translation;
		} catch {
			return fallback;
		}
	};
	import { starknetAccountAddress } from '$lib/stores/starknet';
	import type { PaymentRequest, PaymentResult } from '$lib/types/payment.types';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	// Redirect non-logged-in users
	$: if (browser && !$currentUser) {
		goto('/');
	}

	// Redirect users without WebAuthn credentials
	$: if (browser && $currentUser && (!$currentUser.credentialId || !$currentUser.publicKey)) {
		goto('/');
	}

	// Component state
	let currentCurrency: 'SATS' | 'USD' = 'SATS'; // Default to SATS
	let amount = '';
	let address = '';
	let description = '';
	let fee = '0 SATS';
	let clipboardEmpty = true;
	let btcPrice: PriceData | null = null;
	let priceLoading = false;
	let userFiatCurrency: SupportedCurrency = 'USD'; // Default to USD

	// Store the actual amount in sats for conversion
	let amountInSats = 0;

	// Transaction state
	let isProcessingTransaction = false;
	let transactionError = '';
	let transactionSuccess = false;
	let transactionHash = '';
	// Swap monitoring state (SN->BTC)
	let currentSwapId: string | null = null;
	let isMonitoringSwap = false;
	let swapStatusText = '';
	let swapFinalized = false;
	let swapError = '';
	let swapMonitor: any = null;

	// Paymaster support - enable sponsored transactions for manual transfers
	let usePaymaster = true; // Default to sponsored transactions

	// Payment service instance
	const paymentService = PaymentService.getInstance();

	// Account deployment composable (only initialize if user exists and on client side)
	let accountDeployment: any = null;
	let state: any = null; // store from account deployment (for balance)
	$: if (browser && $currentUser && $currentUser.credentialId && $currentUser.publicKey) {
		accountDeployment = useAccountDeployment($currentUser);
		state = accountDeployment?.state;
	}

	// Check if user came from payment demo and has empty clipboard
	let cameFromPaymentDemo = false;
	let showClipboardBanner = false;
	let bannerClosed = false;

	// Swap mode: Starknet → Bitcoin on-chain
	type SwapMode = 'none' | 'starknet_to_bitcoin';
	let swapMode: SwapMode = 'none';
	let lockedBitcoinAddress: string | null = null;
	let swapMinSats: number | null = null;
	let swapMaxSats: number | null = null;
	$: belowSwapMin =
		swapMode === 'starknet_to_bitcoin' &&
		swapMinSats !== null &&
		amountInSats > 0 &&
		amountInSats < swapMinSats;

	// Pricing service instance - only create when in browser
	let pricingService: any = null;
	$: if (browser) {
		pricingService = PricingOrchestrator.getInstance();
	}

	// Review-only/autopay mode (QR flow)
	let isReviewOnly = false;
	let shouldAutoPay = false;
	let autoPayTriggered = false;
	let isInitializing = true; // Flag to prevent input handler during initialization

	// Available funds (sats) and insufficiency detection
	let availableSats = 0;
	let hasKnownBalance = false;
	$: {
		const realBalance = $state?.accountStatus?.balance;
		if (realBalance && realBalance !== 'Balance unavailable') {
			const parsed = parseFloat(String(realBalance).replace(/[^\d.-]/g, '')) || 0;
			availableSats = parsed;
			hasKnownBalance = true;
		} else {
			hasKnownBalance = false;
		}
	}
	$: insufficientFunds = !isReviewOnly && hasKnownBalance && amountInSats > availableSats;

	function handleBackClick() {
		goto('/payment-demo');
	}

	function handleAmountInput(event: Event) {
		// Skip processing during initialization
		if (isInitializing) {
			console.log('⏸️ Skipping amount input processing during initialization');
			return;
		}

		const target = event.target as HTMLInputElement;
		const inputValue = target.value;

		// Allow empty input
		if (inputValue === '') {
			amount = '';
			amountInSats = 0;
			return;
		}

		// Parse the input value based on current currency
		if (currentCurrency === 'SATS') {
			// Input is in sats, store directly
			amountInSats = parseFloat(inputValue.replace(/[^\d.-]/g, '')) || 0;
			amount = inputValue;
		} else {
			// Input is in USD, convert to sats
			const usdAmount = parseFloat(inputValue.replace(/[^\d.-]/g, '')) || 0;
			if (btcPrice) {
				amountInSats = Math.round((usdAmount / btcPrice.usdPrice) * 100_000_000);
				amount = inputValue;
			} else {
				// If no price available, just store the USD amount
				amount = inputValue;
			}
		}
	}

	// Convert sats to USD for display
	function convertSatsToUSD(sats: number): string {
		if (!btcPrice) return '0.00';
		const usdAmount = (sats / 100_000_000) * btcPrice.usdPrice;
		return usdAmount.toFixed(2);
	}

	// Convert USD to sats
	function convertUSDToSats(usd: number): number {
		if (!btcPrice) return 0;
		return Math.round((usd / btcPrice.usdPrice) * 100_000_000);
	}

	async function toggleCurrency() {
		if (!pricingService) return;

		if (currentCurrency === 'SATS') {
			// Switch to USD, convert current sats amount to USD
			if (!btcPrice && !priceLoading) {
				priceLoading = true;
				try {
					btcPrice = await pricingService.getPrice('WBTC');
				} catch (error) {
					console.error('Failed to fetch BTC price:', error);
				} finally {
					priceLoading = false;
				}
			}

			if (btcPrice) {
				// Convert current sats amount to USD for display
				const usdAmount = convertSatsToUSD(amountInSats);
				amount = usdAmount;
			}

			currentCurrency = userFiatCurrency as 'SATS' | 'USD';
		} else {
			// Switch back to SATS, convert current USD amount to sats
			if (btcPrice) {
				const usdAmount = parseFloat(amount.replace(/[^\d.-]/g, '')) || 0;
				amountInSats = convertUSDToSats(usdAmount);
				amount = amountInSats.toString();
			}
			currentCurrency = 'SATS';
		}
	}

	async function checkClipboardAndOrigin() {
		// Check if user came from payment demo page
		const referrer = document.referrer;
		cameFromPaymentDemo = referrer.includes('/payment-demo');

		if (cameFromPaymentDemo) {
			// Check if clipboard is empty
			try {
				if (navigator.clipboard) {
					const clipboardText = await navigator.clipboard.readText();
					clipboardEmpty = !clipboardText || clipboardText.trim() === '';
				} else {
					clipboardEmpty = true;
				}
			} catch (error) {
				console.error('Failed to read clipboard:', error);
				clipboardEmpty = true;
			}

			// Show banner if user came from payment demo AND clipboard is empty
			// This applies to both "Paste from clipboard" and "Manual entry" options
			showClipboardBanner = cameFromPaymentDemo && clipboardEmpty && !bannerClosed;
		} else {
			showClipboardBanner = false;
		}
	}

	function closeBanner() {
		bannerClosed = true;
		showClipboardBanner = false;
	}

	async function handlePay() {
		// Reset transaction state
		transactionError = '';
		transactionSuccess = false;
		transactionHash = '';
		isProcessingTransaction = true;

		try {
			if (insufficientFunds) {
				throw new Error($i18nReadyStore ? $t('pay.errors.insufficient') : 'Insufficient balance');
			}

			// Check if this is a Lightning invoice payment
			const addressLower = address.trim().toLowerCase();
			const isLightningInvoice =
				addressLower.startsWith('ln') ||
				addressLower.includes('@') ||
				addressLower.startsWith('lnurl');

			if (isLightningInvoice) {
				// Handle Lightning invoice payment
				await handleLightningInvoicePayment();
			} else {
				// Handle regular Starknet payment
				const paymentRequest: PaymentRequest = {
					address: address.trim(),
					amountInSats,
					description,
					usePaymaster
				};

				// Execute payment using the payment service
				const result: PaymentResult = await paymentService.executePayment(
					paymentRequest,
					$currentUser!,
					accountDeployment
				);

				if (result.success) {
					transactionSuccess = true;
					transactionHash = result.transactionHash;
					console.log('Transaction confirmed successfully!');

					// Clear form on success
					amount = '';
					address = '';
					description = '';
					amountInSats = 0;
				} else {
					throw new Error(result.error || 'Transaction failed');
				}
			}
		} catch (error) {
			console.error('Payment error:', error);
			transactionError =
				error instanceof Error
					? error.message
					: $i18nReadyStore
						? $t('pay.errors.payment_failed')
						: 'Payment failed';
		} finally {
			isProcessingTransaction = false;
		}
	}

	async function handleLightningInvoicePayment() {
		try {
			// 0) Final validation check for Lightning invoice
			const addressLower = address.trim().toLowerCase();
			if (addressLower.startsWith('lnbc') || addressLower.startsWith('lntb')) {
				const { decodeLightningInvoice, validateInvoiceForPayment } = await import(
					'$lib/utils/lightning-invoice'
				);
				const decoded = await decodeLightningInvoice(address.trim());

				if (!decoded?.isValid) {
					throw new Error(decoded?.error || 'Invalid Lightning invoice');
				}

				// This will reject amount-less invoices with clear guidance
				const validation = validateInvoiceForPayment(decoded, amountInSats || undefined);
				if (!validation.valid) {
					throw new Error(validation.error || 'Lightning invoice validation failed');
				}

				// Update amount to the validated final amount (should always be from invoice now)
				if (validation.finalAmount) {
					amountInSats = validation.finalAmount;
					console.log(
						`✅ Final amount validated: ${validation.finalAmount} sats (invoice has pre-set amount)`
					);
				}
			} else {
				throw new Error('Invalid Lightning invoice format');
			}

			// 1) Create Starknet → Lightning swap
			const { StarknetToLightningService } = await import(
				'$lib/services/client/lightning/starknet-to-lightning.service'
			);
			const lightningService = new StarknetToLightningService();

			const swap = await lightningService.createStarknetToLightningSwap({
				sourceAsset: 'WBTC',
				starknetAddress: $currentUser!.starknetAddress!.trim(),
				lightningAddress: address.trim(),
				amountInSats: amountInSats
			});

			if (!swap || !swap.swapId) {
				throw new Error('Failed to create Lightning swap');
			}

			currentSwapId = swap.swapId;
			console.log('Lightning swap created:', { swapId: currentSwapId });

			// 2) Fetch unsigned commit transactions for this swap
			const { TransactionApiService } = await import(
				'$lib/services/client/transaction/api-service'
			);
			const txApi = new TransactionApiService();
			const unsigned = await txApi.getUnsignedTransactions(currentSwapId);
			if (!unsigned?.success || !unsigned.transactions?.length) {
				throw new Error(unsigned?.message || 'No unsigned commit transactions available');
			}

			// 3) Build and execute each INVOKE via Avnu paymaster using WebAuthn signature
			const { AvnuService } = await import('$lib/services/client/avnu.client.service');
			const { WebauthnService } = await import('$lib/services/client/webauthn.client.service');
			const { typedData } = await import('starknet');

			const avnuService = AvnuService.getInstance();
			const webauthnService = WebauthnService.getInstance();

			// Resolve WebAuthn rpId/origin robustly
			let rpId: string | undefined = $currentUser?.webauthnCredentials?.rpId;
			let originCfg: string | undefined = $currentUser?.webauthnCredentials?.origin;
			if (!rpId || !originCfg) {
				try {
					const { WebAuthnService: AuthWebAuthnService } = await import(
						'$lib/services/client/auth/webauthn.service'
					);
					const authWeb = new AuthWebAuthnService();
					const cfg = authWeb.getConfig();
					rpId = rpId || cfg.rpId;
					originCfg = originCfg || cfg.origin;
				} catch {}
			}

			if (!rpId || !originCfg || !$currentUser?.credentialId || !$currentUser?.publicKey) {
				throw new Error('Passkey credentials not ready. Please sign in again or refresh the page.');
			}

			const signer = webauthnService.createOwnerFromStoredCredentials(
				rpId,
				originCfg,
				$currentUser.credentialId,
				$currentUser.publicKey
			);

			const signedForServer: Array<{
				type: string;
				txHash: string;
				tx: any;
				signature: any;
			}> = [];
			let lastTxHash = '';
			for (const [idx, txBundle] of unsigned.transactions.entries()) {
				if (txBundle.type !== 'INVOKE' || !Array.isArray(txBundle.tx)) {
					throw new Error(`Unsupported transaction type at index ${idx}: ${txBundle.type}`);
				}

				const calls = txBundle.tx;
				const build = await avnuService.buildPaymasterTransaction({
					accountAddress: $currentUser!.starknetAddress!,
					calls,
					paymentMethod: 'PAYMASTER_SPONSORED' as any
				});

				const msgHash = typedData.getMessageHash(build.typedData, $currentUser!.starknetAddress!);
				const rawSig = await signer.getRawSignature(msgHash);
				const signature = { signer: signer.signer, signature: rawSig } as any;

				const exec = await avnuService.executeSignedPaymasterTransaction({
					accountAddress: $currentUser!.starknetAddress!,
					calls,
					signature,
					typedData: build.typedData,
					paymentMethod: 'PAYMASTER_SPONSORED' as any
				});

				lastTxHash = exec.transactionHash;
				signedForServer.push({
					type: 'INVOKE',
					txHash: lastTxHash,
					tx: calls,
					signature
				});
			}

			// 4) Inform backend of the signed commit transactions (helps SDK correlate)
			try {
				await txApi.submitSignedTransactions(
					currentSwapId,
					unsigned.phase || 'commit',
					signedForServer as any
				);
			} catch (e) {
				console.warn('submitSignedTransactions failed (continuing):', e);
			}

			// 5) Wait for commit confirmation and start payment waiting on server
			try {
				const commitRes = await fetch(`/api/lightning/wait-commit-confirmation/${currentSwapId}`, {
					method: 'POST'
				});
				if (!commitRes.ok) {
					console.warn('wait-commit-confirmation returned non-OK');
				}
			} catch (e) {
				console.warn('wait-commit-confirmation failed:', e);
			}

			try {
				const waitRes = await fetch(`/api/lightning/start-payment-waiting/${currentSwapId}`, {
					method: 'POST'
				});
				if (!waitRes.ok) {
					console.warn('start-payment-waiting returned non-OK');
				}
			} catch (e) {
				console.warn('start-payment-waiting failed:', e);
			}

			// 6) Update UI and start monitoring the Lightning swap status
			transactionSuccess = true;
			transactionHash = lastTxHash;
			amount = '';
			amountInSats = 0;

			try {
				const { PaymentMonitorService } = await import(
					'$lib/services/client/payment-monitor.service'
				);
				if (swapMonitor && typeof swapMonitor.destroy === 'function') {
					try {
						swapMonitor.destroy();
					} catch {}
				}
				swapMonitor = new PaymentMonitorService({
					swapId: currentSwapId,
					paymentMethod: 'lightning',
					debugPolling: false,
					callbacks: {
						onMonitoringChange: (monitoring) => {
							isMonitoringSwap = monitoring;
						},
						onStatusUpdate: (status) => {
							swapStatusText = `Swap status: ${status.status}`;
						},
						onComplete: (status) => {
							swapFinalized = true;
							swapStatusText = 'Swap completed';
							isMonitoringSwap = false;
						},
						onError: (error) => {
							swapError = error;
							isMonitoringSwap = false;
						}
					}
				});
				swapStatusText = 'Monitoring Lightning swap progress...';
				await swapMonitor.startMonitoring();
			} catch (e) {
				console.warn('Failed to start Lightning swap monitoring', e);
			}
		} catch (error) {
			console.error('Lightning payment error:', error);
			throw new Error(error instanceof Error ? error.message : 'Lightning payment failed');
		}
	}

	// Check clipboard and origin when component mounts
	onMount(async () => {
		// Prefill from query parameters (QR or deep link)
		try {
			const url = new URL(window.location.href);
			const recipientAddress = url.searchParams.get('recipientAddress');
			const amountParam = url.searchParams.get('amount');
			const fromParam = url.searchParams.get('from');
			const networkParam = url.searchParams.get('network');
			const autopayParam = url.searchParams.get('autopay');
			const swapModeParam = url.searchParams.get('swapMode');
			const bitcoinAddressParam = url.searchParams.get('bitcoinAddress');

			console.log('🔍 Received query parameters:', {
				recipientAddress: recipientAddress?.substring(0, 50) + '...',
				amountParam,
				description: url.searchParams.get('description'),
				fromParam,
				networkParam,
				autopayParam,
				swapModeParam,
				bitcoinAddressParam
			});

			// Set form values first
			if (recipientAddress) {
				address = recipientAddress;
			}

			if (amountParam) {
				const parsed = parseInt(amountParam, 10);
				if (!isNaN(parsed) && parsed > 0) {
					currentCurrency = 'SATS';
					amountInSats = parsed;
					amount = String(parsed);
					console.log('✅ Amount processed:', {
						amountParam,
						parsed,
						amount,
						amountInSats
					});
				} else {
					console.log('❌ Invalid amount parameter:', { amountParam, parsed });
				}
			} else {
				console.log('❌ No amount parameter found');
			}

			// Handle description parameter (URLSearchParams already encodes)
			const descriptionParam = url.searchParams.get('description');
			if (descriptionParam) {
				description = descriptionParam;
				console.log('✅ Description processed');
			} else {
				console.log('❌ No description parameter found');
			}

			// If address is a BOLT11 invoice, decode locally and validate amount requirement
			try {
				const addr = (address || '').trim().toLowerCase();
				const needsDescription = !descriptionParam || !description;
				if (addr.startsWith('lnbc') || addr.startsWith('lntb')) {
					const { decodeLightningInvoice, validateInvoiceForPayment } = await import(
						'$lib/utils/lightning-invoice'
					);
					const decoded = await decodeLightningInvoice(address.trim());
					if (decoded?.isValid) {
						// Validate invoice - this will now reject amount-less invoices
						const validation = validateInvoiceForPayment(decoded, amountInSats || undefined);

						if (validation.valid && validation.finalAmount) {
							// Invoice has pre-set amount - use it
							currentCurrency = 'SATS';
							amountInSats = validation.finalAmount;
							amount = String(validation.finalAmount);

							console.log(
								`✅ Amount resolved from ${validation.amountSource}:`,
								validation.finalAmount,
								'Invoice has pre-set amount'
							);

							// Clear any previous errors
							transactionError = '';
						} else if (!validation.valid) {
							console.warn('❌ Invoice validation failed:', validation.error);
							// Show validation error immediately to user
							transactionError = validation.error || 'Invalid Lightning invoice';

							// Reset amount fields since invoice is invalid
							amount = '';
							amountInSats = 0;

							// Don't populate address for invalid invoices
							address = '';

							console.log('❌ Lightning invoice rejected:', validation.error);
							return; // Stop processing invalid invoice
						}

						// Only try to populate description if invoice was valid
						if (needsDescription && decoded.description) {
							description = decoded.description;
							console.log('✅ Description populated from BOLT11 decode');
						}
					} else {
						// Invalid invoice format
						console.warn('❌ Invalid Lightning invoice format');
						transactionError = 'Invalid Lightning invoice format';
						address = '';
						amount = '';
						amountInSats = 0;
						return;
					}
				}
			} catch (e) {
				console.warn('BOLT11 decode failed or unavailable:', e);
				transactionError = 'Failed to process Lightning invoice';
				address = '';
				amount = '';
				amountInSats = 0;
			}

			// Set review-only mode after form values are set
			if (fromParam === 'qr' || (recipientAddress && amountParam)) {
				cameFromPaymentDemo = false;
				showClipboardBanner = false;
				bannerClosed = true;
				// Set review-only mode after a small delay to ensure form values are set
				setTimeout(() => {
					isReviewOnly = true;
					console.log('🔒 Form set to review-only mode');
				}, 100);
			}

			// Swap mode (Starknet → Bitcoin): lock address, user chooses amount
			if (swapModeParam === 'starknet_to_bitcoin' && bitcoinAddressParam) {
				swapMode = 'starknet_to_bitcoin';
				lockedBitcoinAddress = bitcoinAddressParam;
				address = bitcoinAddressParam;
				// Only lock address, keep amount editable
				isReviewOnly = false;

				// Fetch swap size limits (min/max) for the pair STARKNET.WBTC -> BITCOIN.BTC
				try {
					const res = await fetch(
						'/api/atomiq/limits?source=STARKNET.WBTC&destination=BITCOIN.BTC'
					);
					const payload = await res.json();
					if (res.ok && payload?.data) {
						swapMinSats = payload.data.minAmount ?? null;
						swapMaxSats = payload.data.maxAmount ?? null;
					} else {
						console.warn('Swap limits unavailable:', payload?.error || payload?.message);
					}
				} catch (e) {
					console.warn('Failed to fetch swap limits', e);
				}
			}

			// Enable autopay if requested
			if (autopayParam === '1' || autopayParam === 'true') {
				shouldAutoPay = true;
			}

			// Optional: validate network is Starknet if provided
			if (networkParam && networkParam !== 'Starknet') {
				console.warn('Unexpected network in query params:', networkParam);
			}
		} catch (e) {
			// Ignore URL parsing errors and continue
		}

		await checkClipboardAndOrigin();

		// Mark initialization as complete
		isInitializing = false;
		console.log('✅ Initialization complete, form values:', {
			address,
			amount,
			description,
			amountInSats
		});

		// Trigger autopay after state is initialized
		if (shouldAutoPay && !autoPayTriggered) {
			// wait a moment to ensure stores/composables are ready
			setTimeout(() => {
				if (
					$currentUser &&
					$currentUser.credentialId &&
					$currentUser.publicKey &&
					!isProcessingTransaction &&
					amountInSats > 0 &&
					address
				) {
					autoPayTriggered = true;
					// If swap-to-bitcoin mode is active, use the proper flow
					if (swapMode === 'starknet_to_bitcoin' && lockedBitcoinAddress) {
						handleSwapToBitcoinPay();
					} else {
						handlePay();
					}
				}
			}, 300);
		}
	});

	// Swap to Bitcoin orchestrator
	async function handleSwapToBitcoinPay() {
		// Reset transaction state
		transactionError = '';
		transactionSuccess = false;
		transactionHash = '';
		isProcessingTransaction = true;

		try {
			if (!lockedBitcoinAddress) {
				throw new Error(
					$i18nReadyStore ? $t('pay.errors.missing_btc_address') : 'Missing Bitcoin address'
				);
			}
			if (amountInSats <= 0) {
				throw new Error($i18nReadyStore ? $t('pay.errors.enter_amount') : 'Please enter an amount');
			}

			// Resolve Starknet address from multiple sources
			const starkAddr =
				$starknetAccountAddress ||
				$state?.accountStatus?.address ||
				$state?.accountAddress ||
				$currentUser?.starknetAddress ||
				'';
			if (!starkAddr || !starkAddr.startsWith('0x')) {
				throw new Error(
					$i18nReadyStore ? $t('pay.errors.starknet_unavailable') : 'Starknet unavailable'
				);
			}

			// 1) Create the Starknet→Bitcoin swap to get deposit address
			const res = await fetch('/api/bitcoin/create-starknet-to-bitcoin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourceAsset: 'WBTC',
					starknetAddress: starkAddr,
					bitcoinAddress: lockedBitcoinAddress,
					amountSats: amountInSats
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				throw new Error(
					payload?.error ||
						payload?.message ||
						($i18nReadyStore ? $t('pay.errors.swap_api') : 'Swap API error')
				);
			}
			const swap = payload?.data;
			if (!swap?.starknetAddress) {
				throw new Error(
					$i18nReadyStore ? $t('pay.errors.missing_deposit') : 'Missing deposit address'
				);
			}
			if (typeof swap.starknetAddress !== 'string' || !swap.starknetAddress.startsWith('0x')) {
				throw new Error(
					'Invalid deposit address returned (expected Starknet 0x address). Please try again.'
				);
			}
			console.log('🔗 SWAP DEBUG: Created SN→BTC swap', {
				swapId: swap?.swapId,
				starknetDepositAddress: swap?.starknetAddress?.slice(0, 12) + '...',
				fullDepositAddress: swap?.starknetAddress,
				isHex: typeof swap?.starknetAddress === 'string' && swap?.starknetAddress.startsWith('0x')
			});
			currentSwapId = swap.swapId;
			swapFinalized = false;
			swapError = '';
			swapStatusText = 'Swap created. Awaiting Starknet transfer...';

			// 2) Execute Atomiq commit transaction(s) via paymaster
			// Fetch unsigned transactions for this swap (commit phase expected)
			const { TransactionApiService } = await import(
				'$lib/services/client/transaction/api-service'
			);
			const txApi = new TransactionApiService();
			const unsigned = await txApi.getUnsignedTransactions(currentSwapId);
			if (!unsigned?.success || !unsigned.transactions?.length) {
				throw new Error(unsigned?.message || 'No unsigned transactions available for swap');
			}

			// Build and execute each transaction using paymaster with WebAuthn signing
			const { AvnuService } = await import('$lib/services/client/avnu.client.service');
			const avnuService = AvnuService.getInstance();
			const { WebauthnService } = await import('$lib/services/client/webauthn.client.service');
			const webauthnService = WebauthnService.getInstance();
			const { typedData } = await import('starknet');

			// Create WebAuthn signer from stored credentials
			const signer = webauthnService.createOwnerFromStoredCredentials(
				$currentUser!.webauthnCredentials!.rpId,
				$currentUser!.webauthnCredentials!.origin,
				$currentUser!.credentialId!,
				$currentUser!.publicKey!
			);

			let lastTxHash = '';
			for (const [idx, txBundle] of unsigned.transactions.entries()) {
				if (txBundle.type !== 'INVOKE' || !Array.isArray(txBundle.tx)) {
					throw new Error(`Unsupported transaction type at index ${idx}: ${txBundle.type}`);
				}

				const calls = txBundle.tx;
				// Build typed data for paymaster
				const build = await avnuService.buildPaymasterTransaction({
					accountAddress: $currentUser!.starknetAddress!,
					calls,
					paymentMethod: 'PAYMASTER_SPONSORED' as any
				});

				// Sign typed data with WebAuthn
				const msgHash = typedData.getMessageHash(build.typedData, $currentUser!.starknetAddress!);
				const rawSig = await signer.getRawSignature(msgHash);
				const signature = { signer: signer.signer, signature: rawSig } as any;

				// Execute via paymaster
				const exec = await avnuService.executeSignedPaymasterTransaction({
					accountAddress: $currentUser!.starknetAddress!,
					calls,
					signature,
					typedData: build.typedData,
					paymentMethod: 'PAYMASTER_SPONSORED' as any
				});

				lastTxHash = exec.transactionHash;
			}

			transactionSuccess = true;
			transactionHash = lastTxHash;
			amount = '';
			amountInSats = 0;

			// Start monitoring the swap until completion
			if (currentSwapId) {
				try {
					const { PaymentMonitorService } = await import(
						'$lib/services/client/payment-monitor.service'
					);
					if (swapMonitor && typeof swapMonitor.destroy === 'function') {
						try {
							swapMonitor.destroy();
						} catch {}
					}
					swapMonitor = new PaymentMonitorService({
						swapId: currentSwapId,
						paymentMethod: 'bitcoin',
						debugPolling: false,
						callbacks: {
							onMonitoringChange: (monitoring) => {
								isMonitoringSwap = monitoring;
							},
							onStatusUpdate: (status) => {
								swapStatusText = `Swap status: ${status.status}`;
							},
							onComplete: (status) => {
								swapFinalized = true;
								swapStatusText = $i18nReadyStore
									? $t('pay.status.swap_completed')
									: 'Swap completed';
								isMonitoringSwap = false;
							},
							onError: (error) => {
								swapError = error;
								isMonitoringSwap = false;
							}
						}
					});
					swapStatusText = $i18nReadyStore ? $t('pay.status.monitoring') : 'Monitoring payment';
					await swapMonitor.startMonitoring();
				} catch (e) {
					console.warn('Failed to start swap monitoring', e);
				}
			}
		} catch (error) {
			console.error('Swap-to-Bitcoin error:', error);
			transactionError =
				error instanceof Error
					? error.message
					: $i18nReadyStore
						? $t('pay.errors.swap_to_btc_failed')
						: 'Swap to BTC failed';
		} finally {
			isProcessingTransaction = false;
		}
	}
</script>

<svelte:head>
	<title>{$i18nReadyStore ? $t('pay.head.title') : 'Pay - BIM Wallet'}</title>
	<meta
		name="description"
		content={$i18nReadyStore ? $t('pay.head.description') : 'Send Bitcoin payments with BIM Wallet'}
	/>
</svelte:head>

<main class="pay-page">
	<!-- Header -->
	<div class="header">
		<button
			class="back-button"
			aria-label={$i18nReadyStore ? $t('pay.header.back') : 'Go back'}
			on:click={handleBackClick}
		>
			←
		</button>
		<h1 class="page-title">{safeTranslation('pay.header.title', 'Pay')}</h1>
	</div>

	<!-- Clipboard Status Banner -->
	{#if showClipboardBanner}
		<div class="clipboard-banner">
			<p>{$i18nReadyStore ? $t('pay.clipboard.empty') : 'Clipboard is empty'}</p>
			<button
				class="close-banner"
				aria-label={$i18nReadyStore ? $t('pay.clipboard.close') : 'Close'}
				on:click={closeBanner}
			>
				×
			</button>
		</div>
	{/if}

	<!-- Amount Input Section -->
	{#if insufficientFunds}
		<div class="insufficient-banner" role="alert">Insufficient funds</div>
	{/if}
	<div class="amount-section">
		<div class="amount-display">
			<input
				type="text"
				class="amount-input"
				class:zero-amount={amount === '' ||
					amount === '0' ||
					amount === '0.00' ||
					amount === '0,00'}
				bind:value={amount}
				on:input={handleAmountInput}
				placeholder={$i18nReadyStore ? $t('pay.amount.placeholder') : 'Enter amount'}
				readonly={isReviewOnly}
			/>
		</div>
		<!-- Currency Button - Outside Card -->
		<div class="currency-button-container">
			<button
				class="currency-button"
				aria-label={$i18nReadyStore ? $t('pay.amount.change_currency') : 'Change currency'}
				on:click={toggleCurrency}
				disabled={priceLoading || isReviewOnly}
			>
				{#if currentCurrency === 'SATS'}
					SATS
				{:else}
					{currentCurrency}
				{/if}
			</button>
		</div>
	</div>

	<!-- Form Fields -->
	<div class="form-section">
		<div class="input-field">
			<Input
				bind:value={address}
				placeholder={swapMode === 'starknet_to_bitcoin'
					? $i18nReadyStore
						? $t('pay.form.address_locked')
						: 'Address (locked)'
					: $i18nReadyStore
						? $t('pay.form.address')
						: 'Bitcoin address'}
				type="text"
				fullWidth
				readonly={isReviewOnly || swapMode === 'starknet_to_bitcoin'}
			/>
		</div>

		<div class="input-field">
			<Input
				bind:value={description}
				placeholder={$i18nReadyStore ? $t('pay.form.description') : 'Description (optional)'}
				type="text"
				fullWidth
				readonly={isReviewOnly}
			/>
		</div>

		<div class="fee-field">
			<span class="fee-label">{$i18nReadyStore ? $t('pay.form.fee') : 'Fee'}</span>
			<span class="fee-amount">{fee}</span>
		</div>
	</div>

	<!-- Transaction Status Messages -->
	{#if swapMode === 'starknet_to_bitcoin' && swapMinSats}
		<div class="transaction-message info-message">
			<p>
				{$i18nReadyStore
					? $t('pay.status.min_swap', { values: { amount: swapMinSats } })
					: `Minimum swap amount: ${swapMinSats} sats`}
			</p>
		</div>
	{/if}
	{#if transactionError}
		<div class="transaction-message error-message">
			<p>❌ {transactionError}</p>
		</div>
	{/if}

	{#if transactionSuccess}
		<div class="transaction-message success-message">
			<p>✅ {$i18nReadyStore ? $t('pay.status.success') : 'Payment successful!'}</p>
			{#if transactionHash}
				<p class="tx-hash">
					{$i18nReadyStore ? $t('pay.status.tx') : 'Transaction:'}
					{transactionHash.substring(0, 10)}...{transactionHash.substring(
						transactionHash.length - 8
					)}
				</p>
			{/if}
			{#if currentSwapId}
				<p class="tx-hash">
					{$i18nReadyStore ? $t('pay.status.swap_id') : 'Swap ID:'}
					{currentSwapId.substring(0, 10)}...{currentSwapId.substring(currentSwapId.length - 8)}
				</p>
			{/if}
			{#if isMonitoringSwap && swapStatusText}
				<p>{swapStatusText}</p>
			{/if}
			{#if swapFinalized}
				<p>🎉 Swap to Bitcoin completed.</p>
			{/if}
			{#if swapError}
				<p class="tx-hash">
					{$i18nReadyStore ? $t('pay.status.swap_error_prefix') : 'Error:'}
					{swapError}
				</p>
			{/if}
		</div>
	{/if}

	<!-- Pay Button -->
	<div class="button-section">
		{#if insufficientFunds}
			<div class="insufficient-banner" role="alert">
				{$i18nReadyStore ? $t('pay.status.insufficient') : 'Insufficient balance'}
			</div>
		{/if}
		<Button
			variant="primary"
			size="large"
			fullWidth
			disabled={isProcessingTransaction ||
				!$currentUser ||
				insufficientFunds ||
				(swapMode === 'starknet_to_bitcoin' &&
					swapMinSats !== null &&
					amountInSats > 0 &&
					amountInSats < swapMinSats)}
			on:click={swapMode === 'starknet_to_bitcoin' ? handleSwapToBitcoinPay : handlePay}
		>
			{#if isProcessingTransaction}
				<span class="loading-spinner"></span>
				{$i18nReadyStore ? $t('pay.status.processing') : 'Processing...'}
			{:else}
				<img
					src="/send-icon.png"
					alt={$i18nReadyStore ? $t('pay.buttons.send_alt') : 'Send'}
					width="20"
					height="20"
					class="btn-icon"
				/>
				{$i18nReadyStore ? $t('pay.buttons.pay') : 'Pay'}
			{/if}
		</Button>
	</div>
</main>

<style>
	.pay-page {
		width: 100%;
		height: 100vh;
		background: var(--color-background, #121413);
		display: flex;
		flex-direction: column;
		padding: 0;
		margin: 0;
		overflow: hidden;
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		gap: var(--space-md, 1rem);
		padding: var(--space-lg, 2rem) var(--space-md, 1rem);
		background: var(--color-background, #121413);
		position: sticky;
		top: 0;
		z-index: 10;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: transparent;
		border: none;
		color: var(--color-text, #ffffff);
		font-size: 1.5rem;
		border-radius: var(--radius-md, 8px);
		cursor: pointer;
		transition: background var(--transition-fast, 0.15s);
	}

	.back-button:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.back-button:focus {
		outline: 2px solid var(--color-primary, #f69413);
		outline-offset: 2px;
	}

	.page-title {
		flex: 1;
		font-size: 1.375rem;
		font-weight: 300;
		color: var(--color-primary, #f69413);
		margin: 0;
		text-align: center;
		margin-right: 40px; /* Balance the back button */
		font-family: 'Roboto', sans-serif;
	}

	/* Clipboard Banner */
	.clipboard-banner {
		background: #ffffff;
		color: #000000;
		text-align: center;
		padding: var(--space-sm, 0.5rem);
		font-weight: bold;
		font-size: 0.875rem;
		margin: 0;
		position: relative;
	}

	.clipboard-banner p {
		margin: 0;
	}

	.close-banner {
		position: absolute;
		top: 4px;
		right: 8px;
		background: none;
		border: none;
		font-size: 16px;
		color: #000;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	/* Insufficient Funds Banner */
	.insufficient-banner {
		background: #3a1f1f;
		color: #ffb3b3;
		border: 1px solid #7a2b2b;
		border-radius: 8px;
		padding: 8px 12px;
		margin: 0 var(--space-md, 1rem) var(--space-sm, 0.5rem);
		text-align: center;
		font-size: 0.9rem;
		font-weight: 500;
	}

	/* Amount Section */
	.amount-section {
		padding: 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin-bottom: 4rem;
	}

	.amount-display {
		position: relative;
		padding: 2px;
		border-radius: 12px;
		background: linear-gradient(90deg, #824d07, #f69413);
		width: 100%;
		max-width: 340px;
		min-height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto;
	}

	.amount-display::before {
		content: '';
		position: absolute;
		inset: 2px;
		background: #2a2a2a;
		border-radius: 10px;
		z-index: 1;
	}

	.amount-input {
		background: transparent;
		border: none;
		color: #ffffff;
		font-size: 57px;
		font-weight: 400;
		line-height: 64px;
		text-align: center;
		width: 100%;
		outline: none;
		letter-spacing: -0.25px;
		transition:
			opacity 0.2s ease,
			color 0.2s ease;
		position: relative;
		z-index: 2;
	}

	.amount-input.zero-amount {
		color: #cacaca;
	}

	.amount-input::placeholder {
		color: #ffffff;
	}

	.amount-input:hover {
		opacity: 0.8;
	}

	.amount-input:focus {
		outline: none;
		box-shadow: none;
	}

	.currency-button-container {
		display: flex;
		justify-content: center;
		margin-top: 16px;
	}

	.currency-button {
		font-family: 'Roboto', Arial, sans-serif;
		font-size: 28px;
		font-weight: 700;
		line-height: 36px;
		color: var(--color-primary, #f69413);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: opacity 0.2s ease;
		position: relative;
		outline: none;
		text-transform: uppercase !important;
	}

	.currency-button:hover {
		opacity: 0.8;
	}

	.currency-button:focus {
		outline: none;
		box-shadow: none;
	}

	.currency-button::after {
		content: '';
		position: absolute;
		bottom: -4px;
		left: 50%;
		transform: translateX(-50%);
		width: 67px;
		height: 2px;
		background: var(--color-primary, #f69413);
	}

	/* Form Section */
	.form-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg, 2rem);
		padding: 0 var(--space-md, 1rem);
		margin-bottom: 120px;
	}

	.input-field {
		display: flex;
		align-items: center;
		background: #2a2a2a;
		border-radius: 15px;
		padding: var(--space-md, 1rem);
		min-height: 45px !important;
		width: 90% !important;
		margin: 0 auto !important;
	}

	/* Override Input component styles */
	.input-field :global(.input-group) {
		width: 100% !important;
		min-height: 45px !important;
	}

	.input-field :global(.input) {
		min-height: 45px !important;
		width: 100% !important;
		padding: var(--space-lg, 1.5rem) var(--space-md, 1rem) !important;
		font-size: 16px !important;
		background: transparent !important;
		border: none !important;
		color: #ffffff !important;
	}

	.input-field :global(.input::placeholder) {
		color: #cacaca !important;
	}

	/* Remove borders from all inputs in form fields */
	.input-field :global(input),
	.fee-field :global(input) {
		border: none;
		outline: none;
		background: transparent;
	}

	/* Remove hover borders from form fields */
	.input-field:hover,
	.fee-field:hover {
		border: none;
		outline: none;
	}

	.fee-field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #2a2a2a;
		border-radius: 15px;
		padding: var(--space-md, 1rem);
		min-height: 45px !important;
		width: 90% !important;
		margin: 0 auto !important;
	}

	.fee-label {
		color: #cacaca;
		font-size: 1rem;
	}

	.fee-amount {
		color: rgba(202, 202, 202, 0.79);
		font-size: 1rem;
	}

	/* Button Section */
	.button-section {
		padding: 0 var(--space-lg, 2rem) 2rem;
		margin-top: auto;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--color-background, #121413);
		z-index: 10;
	}

	.btn-icon {
		flex-shrink: 0;
	}

	/* Transaction Messages */
	.transaction-message {
		margin: 0 var(--space-md, 1rem);
		padding: var(--space-md, 1rem);
		border-radius: 8px;
		margin-bottom: var(--space-md, 1rem);
		text-align: center;
	}

	.error-message {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		color: #f87171;
	}

	.success-message {
		background: rgba(74, 222, 128, 0.1);
		border: 1px solid rgba(74, 222, 128, 0.3);
		color: #4ade80;
	}

	.transaction-message p {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.tx-hash {
		font-family: monospace;
		font-size: 0.8rem !important;
		opacity: 0.8;
		margin-top: var(--space-xs, 0.25rem) !important;
	}

	/* Loading Spinner */
	.loading-spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		margin-right: var(--space-xs, 0.25rem);
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: #ffffff;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Mobile Optimizations */
	@media (max-width: 767px) {
		.header {
			padding: var(--space-md, 1rem) var(--space-sm, 0.5rem);
		}

		.page-title {
			font-size: 1.25rem;
			margin-right: 32px;
		}

		.amount-section {
			padding: var(--space-lg, 2rem) var(--space-sm, 0.5rem);
		}

		.amount-input {
			font-size: 2.5rem;
		}

		.currency-label {
			font-size: 1.75rem;
		}

		.form-section {
			padding: 0 var(--space-md, 1rem);
			gap: var(--space-md, 1rem);
		}

		.button-section {
			padding: 0 var(--space-md, 1rem) var(--space-lg, 2rem);
		}
	}

	/* High contrast mode support */
	@media (prefers-contrast: high) {
		.amount-display {
			border-width: 3px;
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.back-button,
		.amount-input {
			transition: none;
		}
	}

	/* Touch device optimizations */
	@media (hover: none) and (pointer: coarse) {
		.input-field,
		.fee-field {
			min-height: 40px;
		}
	}
</style>
