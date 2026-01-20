/**
 * @fileoverview Lightning Invoice Utilities
 *
 * Utilities for parsing and validating BOLT11 Lightning invoices.
 * Used for extracting invoice details when processing QR code scans.
 *
 * @author bim
 * @version 1.0.0
 */

// Note: bolt11 library will be imported dynamically to handle browser compatibility

/**
 * Create a fallback response when bolt11 decoding fails
 * Provides basic Lightning invoice validation without full decoding
 */
function createFallbackResponse(invoice: string, errorMessage: string): DecodedInvoice {
	const trimmed = invoice.trim();

	// Basic network detection from prefix
	let network = 'unknown';
	const lowerInvoice = trimmed.toLowerCase();
	if (lowerInvoice.startsWith('lnbc')) {
		network = 'bitcoin';
	} else if (lowerInvoice.startsWith('lntb')) {
		network = 'testnet';
	} else if (lowerInvoice.startsWith('lnbcrt')) {
		network = 'regtest';
	}

	// Basic format validation - Lightning invoices should be at least 100+ chars
	const isBasicallyValid =
		trimmed.length > 100 &&
		(lowerInvoice.startsWith('lnbc') ||
			lowerInvoice.startsWith('lntb') ||
			lowerInvoice.startsWith('lnbcrt'));

	return {
		invoice: trimmed,
		network,
		amount: null, // Cannot determine without decoding
		amountSats: null, // Cannot determine without decoding
		description: 'Unable to decode - decoder unavailable',
		paymentHash: '',
		expiry: 3600, // Default to 1 hour
		expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
		createdAt: new Date(), // Assume current time
		isExpired: false, // Assume not expired since we can't tell
		isValid: isBasicallyValid,
		error: isBasicallyValid ? undefined : errorMessage
	};
}

/**
 * Interface for decoded Lightning invoice data
 */
export interface DecodedInvoice {
	invoice: string;
	network: string;
	amount: number | null; // in millisatoshis, null for amount-less invoices
	amountSats: number | null; // in satoshis, null for amount-less invoices
	description: string;
	paymentHash: string;
	expiry: number; // seconds from creation
	expiresAt: Date;
	createdAt: Date;
	isExpired: boolean;
	isValid: boolean;
	error?: string;
}

/**
 * Decode a BOLT11 Lightning invoice
 */
export async function decodeLightningInvoice(invoice: string): Promise<DecodedInvoice> {
	try {
		if (!invoice || typeof invoice !== 'string') {
			return {
				invoice: invoice || '',
				network: '',
				amount: null,
				amountSats: null,
				description: '',
				paymentHash: '',
				expiry: 0,
				expiresAt: new Date(),
				createdAt: new Date(),
				isExpired: true,
				isValid: false,
				error: 'Invalid invoice format'
			};
		}

		const trimmedInvoice = invoice.trim();

		// Basic format validation
		if (!trimmedInvoice.toLowerCase().startsWith('ln')) {
			return {
				invoice: trimmedInvoice,
				network: '',
				amount: null,
				amountSats: null,
				description: '',
				paymentHash: '',
				expiry: 0,
				expiresAt: new Date(),
				createdAt: new Date(),
				isExpired: true,
				isValid: false,
				error: 'Invoice must start with "ln"'
			};
		}

		// First, try a browser-friendly decoder: light-bolt11-decoder
		try {
			console.log('🔍 Attempting to import light-bolt11-decoder...');
			const lb11 = await import('light-bolt11-decoder');
			const lbDecode =
				lb11 && typeof lb11.decode === 'function'
					? lb11.decode
					: lb11 && lb11.default && typeof lb11.default.decode === 'function'
						? lb11.default.decode
						: lb11 && typeof lb11.default === 'function'
							? lb11.default
							: undefined;

			if (!lbDecode) {
				throw new Error('No decode function found in light-bolt11-decoder');
			}

			const res = lbDecode(trimmedInvoice);
			// Extract fields from light-bolt11-decoder result
			const sections: any[] = Array.isArray(res?.sections) ? res.sections : [];
			const tsSec: number | undefined = sections.find((s) => s?.name === 'timestamp')?.value;
			const amountMsatStr: string | undefined = sections.find((s) => s?.name === 'amount')?.value;
			const amountMsat = amountMsatStr ? Number(amountMsatStr) : undefined;
			const amountSats =
				typeof amountMsat === 'number' && isFinite(amountMsat)
					? Math.floor(amountMsat / 1000)
					: null;

			// Determine network from bech32 prefix
			const coinNet = sections.find((s) => s?.name === 'coin_network')?.value as
				| { bech32?: string }
				| undefined;
			const bech32Prefix = coinNet?.bech32?.toLowerCase();
			let network = 'unknown';
			if (bech32Prefix === 'bc') network = 'bitcoin';
			else if (bech32Prefix === 'tb' || bech32Prefix === 'tbs') network = 'testnet';
			else if (bech32Prefix === 'bcrt') network = 'regtest';

			const description: string = (res as any).description || '';
			const paymentHash: string = (res as any).payment_hash || '';

			// Handle expiry calculation more carefully
			const createdAt = tsSec ? new Date(tsSec * 1000) : new Date();
			const expiresAtSec: number | undefined = (res as any).expiry;
			const expiryTtlSec: number | undefined =
				(res as any).expiry_time || (res as any).min_final_cltv_expiry;

			console.log('🔍 Light-bolt11-decoder expiry debug:', {
				tsSec,
				createdAt: createdAt.toISOString(),
				expiresAtSec,
				expiryTtlSec,
				rawExpiry: (res as any).expiry,
				currentTime: new Date().toISOString()
			});

			let expiresAt: Date;
			let ttl: number;

			if (expiresAtSec) {
				// Need to determine if expiresAtSec is an absolute timestamp or TTL
				// Absolute timestamps are typically > 31536000 (1 year in seconds, ~2001+ era)
				// TTL values are typically smaller (seconds/minutes/hours/days/weeks)
				if (expiresAtSec > 31536000) {
					// Likely an absolute timestamp (seconds since epoch)
					expiresAt = new Date(expiresAtSec * 1000);
					ttl = Math.max(1, Math.round((expiresAt.getTime() - createdAt.getTime()) / 1000));
				} else {
					// Likely a TTL value (time-to-live in seconds)
					ttl = expiresAtSec;
					expiresAt = new Date(createdAt.getTime() + ttl * 1000);
				}
			} else if (expiryTtlSec) {
				// If we have TTL, calculate expiry from creation time
				ttl = expiryTtlSec;
				expiresAt = new Date(createdAt.getTime() + ttl * 1000);
			} else {
				// Default to 1 hour if no expiry info found
				ttl = 3600;
				expiresAt = new Date(createdAt.getTime() + ttl * 1000);
			}

			console.log('🔍 Calculated expiry (light-bolt11):', {
				ttl,
				expiresAt: expiresAt.toISOString(),
				isExpired: Date.now() > expiresAt.getTime(),
				timeUntilExpiry: Math.round((expiresAt.getTime() - Date.now()) / 1000 / 60) + ' minutes',
				interpretedAs:
					expiresAtSec && expiresAtSec > 31536000 ? 'absolute timestamp' : 'TTL seconds'
			});

			return {
				invoice: trimmedInvoice,
				network,
				amount: typeof amountMsat === 'number' && isFinite(amountMsat) ? amountMsat : null,
				amountSats,
				description: description || '',
				paymentHash: paymentHash || '',
				expiry: ttl,
				expiresAt,
				createdAt,
				isExpired: Date.now() > expiresAt.getTime(),
				isValid: true
			};
		} catch (lbErr) {
			console.warn('⚠️ light-bolt11-decoder failed or unavailable, falling back to bolt11:', {
				message: lbErr instanceof Error ? lbErr.message : String(lbErr)
			});
		}

		// Fallback: try the original bolt11 module
		let bolt11Module: any;
		let decodeFn: any;
		try {
			console.log('🔍 Attempting to import bolt11 library...');
			bolt11Module = await import('bolt11');
			console.log('🔍 bolt11Module imported:', {
				moduleType: typeof bolt11Module,
				defaultExport: typeof bolt11Module.default,
				decodeExport: typeof bolt11Module.decode,
				moduleKeys: Object.keys(bolt11Module),
				environment: typeof window !== 'undefined' ? 'browser' : 'server'
			});

			if (bolt11Module.decode && typeof bolt11Module.decode === 'function') {
				decodeFn = bolt11Module.decode.bind(bolt11Module);
				console.log('✅ Using bolt11Module.decode (bound)');
			} else if (bolt11Module.default && typeof bolt11Module.default.decode === 'function') {
				decodeFn = bolt11Module.default.decode.bind(bolt11Module.default);
				console.log('✅ Using bolt11Module.default.decode (bound)');
			} else if (typeof bolt11Module.default === 'function') {
				decodeFn = bolt11Module.default;
				console.log('✅ Using bolt11Module.default as decode function');
			} else {
				const possibleFunctions = Object.keys(bolt11Module).filter(
					(key) => key.includes('decode') || key.includes('Decode')
				);
				if (possibleFunctions.length > 0) {
					const fnName = possibleFunctions[0];
					decodeFn = bolt11Module[fnName];
					console.log(`✅ Using bolt11Module.${fnName} as decode function`);
				} else {
					throw new Error('No decode function found in bolt11 module');
				}
			}

			if (!decodeFn || typeof decodeFn !== 'function') {
				throw new Error(`Decode function is not callable: ${typeof decodeFn}`);
			}
		} catch (importError) {
			console.error('❌ Failed to import or setup bolt11 library:', {
				error: importError,
				message: importError instanceof Error ? importError.message : 'Unknown error',
				stack: importError instanceof Error ? importError.stack : 'No stack trace',
				environment: typeof window !== 'undefined' ? 'browser' : 'server'
			});
			console.log('🔄 Falling back to basic Lightning invoice validation...');
			return createFallbackResponse(
				trimmedInvoice,
				`Lightning invoice decoder not available: ${importError instanceof Error ? importError.message : 'Import failed'}`
			);
		}

		// Decode with bolt11
		let decoded;
		try {
			console.log(
				'🔍 Attempting to decode invoice with bolt11:',
				trimmedInvoice.substring(0, 20) + '...'
			);
			try {
				decoded = decodeFn(trimmedInvoice);
			} catch (contextError) {
				console.log('❌ Direct call failed, trying with module context...');
				if (bolt11Module.decode) {
					decoded = bolt11Module.decode(trimmedInvoice);
				} else if (bolt11Module.default && bolt11Module.default.decode) {
					decoded = bolt11Module.default.decode(trimmedInvoice);
				} else {
					throw contextError;
				}
			}

			console.log('✅ Invoice decode successful (bolt11):', {
				hasResult: !!decoded,
				resultType: typeof decoded,
				resultKeys: decoded ? Object.keys(decoded).slice(0, 10) : []
			});
		} catch (decodeError) {
			console.error('❌ bolt11.decode failed:', {
				error: decodeError,
				errorName: decodeError instanceof Error ? decodeError.name : 'Unknown',
				errorMessage: decodeError instanceof Error ? decodeError.message : 'Unknown decode error',
				errorStack: decodeError instanceof Error ? decodeError.stack : 'No stack trace',
				invoice: trimmedInvoice.substring(0, 20) + '...',
				invoiceLength: trimmedInvoice.length,
				decodeFnType: typeof decodeFn,
				moduleKeys: bolt11Module ? Object.keys(bolt11Module) : []
			});
			console.log('🔄 Falling back to basic validation after decode failure...');
			return createFallbackResponse(
				trimmedInvoice,
				`Decode failed: ${decodeError instanceof Error ? decodeError.message : 'Unknown error'}`
			);
		}

		if (!decoded) {
			console.log('🔄 Falling back to basic validation - no decode result...');
			return createFallbackResponse(
				trimmedInvoice,
				'Failed to decode invoice - no result returned'
			);
		}

		// Extract network from prefix
		let network = 'unknown';
		if (trimmedInvoice.toLowerCase().startsWith('lnbc')) {
			network = 'bitcoin';
		} else if (trimmedInvoice.toLowerCase().startsWith('lntb')) {
			network = 'testnet';
		} else if (trimmedInvoice.toLowerCase().startsWith('lnbcrt')) {
			network = 'regtest';
		}

		// Extract amount in millisatoshis
		const amountMsat = decoded.millisatoshis;
		const amountSats = amountMsat ? Math.floor(Number(amountMsat) / 1000) : null;

		// Extract description
		let description = '';
		if (decoded.tags) {
			const descTag = decoded.tags.find((tag) => tag.tagName === 'description');
			if (descTag && descTag.data) {
				description = String(descTag.data);
			}
		}

		// Extract payment hash
		let paymentHash = '';
		if (decoded.tags) {
			const hashTag = decoded.tags.find((tag) => tag.tagName === 'payment_hash');
			if (hashTag && hashTag.data) {
				paymentHash = String(hashTag.data);
			}
		}

		// Calculate expiry with proper handling
		let createdAt: Date;
		let expiry: number;
		let expiresAt: Date;

		console.log('🔍 Bolt11 expiry debug:', {
			timeExpireDate: decoded.timeExpireDate,
			timeExpireDateString: decoded.timeExpireDateString,
			timestamp: decoded.timestamp,
			currentTime: Date.now() / 1000,
			decodedKeys: Object.keys(decoded)
		});

		// Use timestamp from decoded invoice, fallback to current time
		if (decoded.timestamp) {
			createdAt = new Date(decoded.timestamp * 1000);
		} else if (decoded.timeExpireDate) {
			// If we have expiry but no creation time, estimate creation time
			const expiryTime = new Date(decoded.timeExpireDate * 1000);
			const defaultTtl = decoded.timeExpireDateString || 3600;
			createdAt = new Date(expiryTime.getTime() - defaultTtl * 1000);
		} else {
			// Fallback to current time (but this is suspicious for decoding)
			createdAt = new Date();
		}

		// Calculate expiry TTL and expiry date
		if (decoded.timeExpireDateString && typeof decoded.timeExpireDateString === 'number') {
			expiry = decoded.timeExpireDateString;
			expiresAt = new Date(createdAt.getTime() + expiry * 1000);
		} else if (decoded.timeExpireDate) {
			expiresAt = new Date(decoded.timeExpireDate * 1000);
			expiry = Math.max(1, Math.round((expiresAt.getTime() - createdAt.getTime()) / 1000));
		} else {
			// Default to 1 hour if no expiry info found
			expiry = 3600;
			expiresAt = new Date(createdAt.getTime() + expiry * 1000);
		}

		const isExpired = new Date() > expiresAt;

		console.log('🔍 Calculated expiry (bolt11):', {
			createdAt: createdAt.toISOString(),
			expiry,
			expiresAt: expiresAt.toISOString(),
			isExpired,
			timeUntilExpiry: Math.round((expiresAt.getTime() - Date.now()) / 1000 / 60) + ' minutes'
		});

		return {
			invoice: trimmedInvoice,
			network,
			amount: amountMsat ? Number(amountMsat) : null,
			amountSats,
			description,
			paymentHash,
			expiry,
			expiresAt,
			createdAt,
			isExpired,
			isValid: true
		};
	} catch (error) {
		console.error('Lightning invoice decode error:', error);

		return {
			invoice: invoice || '',
			network: '',
			amount: null,
			amountSats: null,
			description: '',
			paymentHash: '',
			expiry: 0,
			expiresAt: new Date(),
			createdAt: new Date(),
			isExpired: true,
			isValid: false,
			error: error instanceof Error ? error.message : 'Failed to decode invoice'
		};
	}
}

/**
 * Validate if a string is a Lightning invoice
 */
export function isLightningInvoice(text: string): boolean {
	if (!text || typeof text !== 'string') {
		return false;
	}

	const trimmed = text.trim().toLowerCase();
	return trimmed.startsWith('lnbc') || trimmed.startsWith('lntb') || trimmed.startsWith('lnbcrt');
}

/**
 * Format amount for display
 */
export function formatInvoiceAmount(amountSats: number | null): string {
	if (amountSats === null || amountSats === 0) {
		return 'Amount not specified';
	}

	return `${new Intl.NumberFormat().format(amountSats)} sats`;
}

/**
 * Format expiry time for display
 */
export function formatExpiryTime(expiresAt: Date): string {
	const now = new Date();
	const diffMs = expiresAt.getTime() - now.getTime();

	if (diffMs <= 0) {
		return 'Expired';
	}

	const diffMinutes = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffDays > 0) {
		return `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
	} else if (diffHours > 0) {
		return `Expires in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
	} else if (diffMinutes > 0) {
		return `Expires in ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
	} else {
		return 'Expires soon';
	}
}

/**
 * Get network display name
 */
export function getNetworkDisplayName(network: string): string {
	switch (network.toLowerCase()) {
		case 'bitcoin':
			return 'Bitcoin Mainnet';
		case 'testnet':
			return 'Bitcoin Testnet';
		case 'regtest':
			return 'Bitcoin Regtest';
		default:
			return 'Unknown Network';
	}
}

/**
 * Validate invoice for payment (requiring invoices with pre-set amounts)
 */
export function validateInvoiceForPayment(
	decoded: DecodedInvoice,
	userAmountSats?: number
): {
	valid: boolean;
	error?: string;
	finalAmount?: number;
	amountSource?: 'invoice' | 'user';
} {
	if (!decoded.isValid) {
		return { valid: false, error: decoded.error || 'Invalid invoice' };
	}

	if (decoded.isExpired) {
		return { valid: false, error: 'Invoice has expired' };
	}

	if (decoded.network !== 'bitcoin') {
		return {
			valid: false,
			error: `Testnet/regtest invoices not supported. Network: ${decoded.network}`
		};
	}

	// Check if invoice has a pre-set amount
	if (decoded.amountSats === null || decoded.amountSats <= 0) {
		return {
			valid: false,
			error:
				"This Lightning invoice doesn't specify an amount. Please generate a new Lightning invoice that includes the payment amount, then try again."
		};
	}

	// Invoice has amount - use it
	const finalAmount = decoded.amountSats;
	const amountSource = 'invoice';

	// Check for conflicts with user-provided amount (if any)
	if (userAmountSats && userAmountSats !== finalAmount) {
		return {
			valid: false,
			error: `Amount conflict: Invoice specifies ${finalAmount} sats, but you entered ${userAmountSats} sats. Invoice amount takes precedence.`
		};
	}

	// Validate final amount is within reasonable limits
	if (finalAmount < 1000) {
		return { valid: false, error: 'Minimum payment amount is 1,000 sats' };
	}

	if (finalAmount > 100000000) {
		// 1 BTC
		return {
			valid: false,
			error: 'Maximum payment amount is 100,000,000 sats (1 BTC)'
		};
	}

	return { valid: true, finalAmount, amountSource };
}

/**
 * Extract invoice summary for display
 */
export function getInvoiceSummary(decoded: DecodedInvoice): {
	amount: string;
	description: string;
	network: string;
	expiry: string;
	hash: string;
} {
	return {
		amount: formatInvoiceAmount(decoded.amountSats),
		description: decoded.description || 'No description',
		network: getNetworkDisplayName(decoded.network),
		expiry: formatExpiryTime(decoded.expiresAt),
		hash: decoded.paymentHash.substring(0, 16) + '...' || 'Unknown'
	};
}
