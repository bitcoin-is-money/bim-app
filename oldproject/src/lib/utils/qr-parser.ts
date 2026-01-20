/**
 * @fileoverview QR Code Data Parser Service
 *
 * Service for parsing and identifying different types of QR code data:
 * - Lightning invoices (BOLT11)
 * - Bitcoin addresses (P2PKH, P2SH, Bech32)
 * - Starknet invoices (JSON format)
 *
 * @author bim
 * @version 1.0.0
 */

import type { StarknetReceiveData } from '$lib/services/client/lightning/types';
import { decodeLightningInvoice, type DecodedInvoice } from './lightning-invoice';
import {
	isValidBitcoinAddress,
	isValidLightningAddress,
	isValidStarknetAddress
} from './payment-utils';

/**
 * Enum for different QR code data types
 */
export enum QRDataType {
	LIGHTNING_INVOICE = 'lightning_invoice',
	BITCOIN_ADDRESS = 'bitcoin_address',
	STARKNET_INVOICE = 'starknet_invoice',
	UNKNOWN = 'unknown'
}

/**
 * Interface for parsed QR code result
 */
export interface ParsedQRData {
	type: QRDataType;
	rawData: string;
	parsedData: any;
	isValid: boolean;
	error?: string;
}

/**
 * Interface for Lightning invoice data
 */
export interface LightningInvoiceData {
	invoice: string;
	type: 'bolt11' | 'lightning_address' | 'lnurl';
	decoded?: DecodedInvoice; // Enhanced with decoded BOLT11 data
}

/**
 * Interface for Bitcoin address data
 */
export interface BitcoinAddressData {
	address: string;
	type: 'p2pkh' | 'p2sh' | 'bech32';
	amount?: number; // if BIP-21 URI
	label?: string; // if BIP-21 URI
	message?: string; // if BIP-21 URI
}

/**
 * Main QR data parsing function
 */
export async function parseQRData(rawData: string): Promise<ParsedQRData> {
	console.log('🔍 parseQRData() called with raw data:', {
		rawDataLength: rawData?.length,
		rawDataType: typeof rawData,
		rawDataPreview: rawData?.substring(0, 150),
		timestamp: new Date().toISOString()
	});

	if (!rawData || typeof rawData !== 'string') {
		console.error('❌ parseQRData() failed - invalid input:', {
			rawData,
			type: typeof rawData,
			error: 'Invalid or empty QR data'
		});
		return {
			type: QRDataType.UNKNOWN,
			rawData: rawData || '',
			parsedData: null,
			isValid: false,
			error: 'Invalid or empty QR data'
		};
	}

	const trimmedData = rawData.trim();
	console.log('📝 Trimmed data:', {
		length: trimmedData.length,
		preview: trimmedData.substring(0, 100),
		startsWithJSON: trimmedData.startsWith('{'),
		endsWithJSON: trimmedData.endsWith('}')
	});

	// Collect all parser errors for better debugging
	const parserErrors: string[] = [];

	// Try to parse as Lightning invoice
	console.log('⚡ Trying Lightning invoice parser...');
	const lightningResult = await parseLightningInvoice(trimmedData);
	if (lightningResult.isValid) {
		console.log('✅ Lightning parser succeeded');
		return lightningResult;
	} else {
		console.log('❌ Lightning parser failed:', lightningResult.error);
		parserErrors.push(`Lightning: ${lightningResult.error}`);
	}

	// Try to parse as Bitcoin address
	console.log('₿ Trying Bitcoin address parser...');
	const bitcoinResult = parseBitcoinAddress(trimmedData);
	if (bitcoinResult.isValid) {
		console.log('✅ Bitcoin parser succeeded');
		return bitcoinResult;
	} else {
		console.log('❌ Bitcoin parser failed:', bitcoinResult.error);
		parserErrors.push(`Bitcoin: ${bitcoinResult.error}`);
	}

	// Try to parse as Starknet invoice
	console.log('🌐 Trying Starknet invoice parser...');
	const starknetResult = parseStarknetInvoice(trimmedData);
	if (starknetResult.isValid) {
		console.log('✅ Starknet parser succeeded');
		return starknetResult;
	} else {
		console.log('❌ Starknet parser failed:', starknetResult.error);
		parserErrors.push(`Starknet: ${starknetResult.error}`);
	}

	// If this looks like JSON but Starknet parsing failed, return the Starknet error for better debugging
	if (trimmedData.startsWith('{') && trimmedData.endsWith('}')) {
		console.error('❌ JSON-like data detected but all parsers failed. Returning Starknet error:', {
			starknetError: starknetResult.error,
			allErrors: parserErrors,
			dataPreview: trimmedData.substring(0, 200)
		});

		// Return the specific Starknet error instead of generic message
		return {
			type: QRDataType.UNKNOWN,
			rawData: trimmedData,
			parsedData: null,
			isValid: false,
			error: starknetResult.error || 'Failed to parse as Starknet invoice'
		};
	}

	// Generic failure - no parser recognized the format
	const combinedError =
		parserErrors.length > 0
			? `No parser succeeded. Errors: ${parserErrors.join(' | ')}`
			: 'Unrecognized QR code format';

	console.error('❌ All parsers failed:', {
		error: combinedError,
		parserErrors,
		dataLooksLikeJSON: trimmedData.startsWith('{') && trimmedData.endsWith('}'),
		dataPreview: trimmedData.substring(0, 100)
	});

	return {
		type: QRDataType.UNKNOWN,
		rawData: trimmedData,
		parsedData: null,
		isValid: false,
		error: combinedError
	};
}

/**
 * Parse Lightning invoice data
 */
export async function parseLightningInvoice(data: string): Promise<ParsedQRData> {
	try {
		const lowerData = data.toLowerCase();

		// BOLT11 invoice
		if (lowerData.startsWith('lnbc') || lowerData.startsWith('lntb')) {
			if (isValidLightningAddress(data)) {
				// Try to decode BOLT11 invoice for enhanced data
				const decoded = await decodeLightningInvoice(data);

				return {
					type: QRDataType.LIGHTNING_INVOICE,
					rawData: data,
					parsedData: {
						invoice: data,
						type: 'bolt11',
						decoded: decoded.isValid ? decoded : undefined
					} as LightningInvoiceData,
					isValid: true
				};
			}
		}

		// Lightning address (user@domain.com)
		if (data.includes('@') && isValidLightningAddress(data)) {
			return {
				type: QRDataType.LIGHTNING_INVOICE,
				rawData: data,
				parsedData: {
					invoice: data,
					type: 'lightning_address'
				} as LightningInvoiceData,
				isValid: true
			};
		}

		// LNURL
		if (lowerData.startsWith('lnurl') && isValidLightningAddress(data)) {
			return {
				type: QRDataType.LIGHTNING_INVOICE,
				rawData: data,
				parsedData: {
					invoice: data,
					type: 'lnurl'
				} as LightningInvoiceData,
				isValid: true
			};
		}

		return {
			type: QRDataType.UNKNOWN,
			rawData: data,
			parsedData: null,
			isValid: false,
			error: 'Invalid Lightning invoice format'
		};
	} catch (error) {
		return {
			type: QRDataType.UNKNOWN,
			rawData: data,
			parsedData: null,
			isValid: false,
			error: `Lightning parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Parse Bitcoin address data
 */
export function parseBitcoinAddress(data: string): ParsedQRData {
	try {
		// Handle BIP-21 URI format (bitcoin:address?amount=x&label=y)
		if (data.toLowerCase().startsWith('bitcoin:')) {
			return parseBitcoinURI(data);
		}

		// Handle plain Bitcoin address
		if (isValidBitcoinAddress(data)) {
			let addressType: 'p2pkh' | 'p2sh' | 'bech32';

			if (data.startsWith('1')) {
				addressType = 'p2pkh';
			} else if (data.startsWith('3')) {
				addressType = 'p2sh';
			} else if (data.startsWith('bc1') || data.startsWith('tb1')) {
				addressType = 'bech32';
			} else {
				throw new Error('Unknown address format');
			}

			return {
				type: QRDataType.BITCOIN_ADDRESS,
				rawData: data,
				parsedData: {
					address: data,
					type: addressType
				} as BitcoinAddressData,
				isValid: true
			};
		}

		return {
			type: QRDataType.UNKNOWN,
			rawData: data,
			parsedData: null,
			isValid: false,
			error: 'Invalid Bitcoin address format'
		};
	} catch (error) {
		return {
			type: QRDataType.UNKNOWN,
			rawData: data,
			parsedData: null,
			isValid: false,
			error: `Bitcoin parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Parse BIP-21 Bitcoin URI
 */
function parseBitcoinURI(uri: string): ParsedQRData {
	try {
		const url = new URL(uri);
		const address = url.pathname;

		if (!isValidBitcoinAddress(address)) {
			throw new Error('Invalid Bitcoin address in URI');
		}

		let addressType: 'p2pkh' | 'p2sh' | 'bech32';
		if (address.startsWith('1')) {
			addressType = 'p2pkh';
		} else if (address.startsWith('3')) {
			addressType = 'p2sh';
		} else if (address.startsWith('bc1') || address.startsWith('tb1')) {
			addressType = 'bech32';
		} else {
			throw new Error('Unknown address format in URI');
		}

		const parsedData: BitcoinAddressData = {
			address,
			type: addressType
		};

		// Parse optional parameters
		const amount = url.searchParams.get('amount');
		if (amount) {
			const btcAmount = parseFloat(amount);
			if (!isNaN(btcAmount) && btcAmount > 0) {
				parsedData.amount = Math.round(btcAmount * 100_000_000); // Convert BTC to sats
			}
		}

		const label = url.searchParams.get('label');
		if (label) {
			parsedData.label = decodeURIComponent(label);
		}

		const message = url.searchParams.get('message');
		if (message) {
			parsedData.message = decodeURIComponent(message);
		}

		return {
			type: QRDataType.BITCOIN_ADDRESS,
			rawData: uri,
			parsedData,
			isValid: true
		};
	} catch (error) {
		return {
			type: QRDataType.UNKNOWN,
			rawData: uri,
			parsedData: null,
			isValid: false,
			error: `BIP-21 URI parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Parse Starknet invoice data (JSON format)
 */
export function parseStarknetInvoice(data: string): ParsedQRData {
	console.log('🌐 parseStarknetInvoice() called with data:', {
		dataLength: data?.length,
		dataType: typeof data,
		dataPreview: data?.substring(0, 200),
		timestamp: new Date().toISOString()
	});

	try {
		// Try to parse as JSON
		const parsed = JSON.parse(data);
		console.log('✅ JSON.parse() successful:', {
			parsedType: typeof parsed,
			parsedKeys: Object.keys(parsed || {}),
			parsed: parsed
		});

		// Normalize potential short-key format to standard fields
		// Support either { recipientAddress, amount, network } or compact { r, a, n }
		const normalized = (() => {
			if (!parsed || typeof parsed !== 'object') return null as any;
			const r = (parsed as any).recipientAddress || (parsed as any).address || (parsed as any).r;
			const a = (parsed as any).amount ?? (parsed as any).a;
			// Accept both full and compact network values
			const rawN = (parsed as any).network ?? (parsed as any).n;
			let n = rawN;
			if (typeof rawN === 'string' && rawN.length === 1 && rawN.toUpperCase() === 'S') {
				n = 'Starknet';
			}
			return { recipientAddress: r, amount: a, network: n } as {
				recipientAddress: unknown;
				amount: unknown;
				network: unknown;
			};
		})();

		// Enhanced structure validation with better error reporting
		const validationResults = {
			isObject: parsed && typeof parsed === 'object',
			hasRecipientAddress: typeof (normalized as any)?.recipientAddress === 'string',
			hasAmount: typeof (normalized as any)?.amount === 'number',
			hasCorrectNetwork: (normalized as any)?.network === 'Starknet',
			actualNetwork: (normalized as any)?.network,
			actualNetworkType: typeof (normalized as any)?.network,
			actualRecipientAddress: (normalized as any)?.recipientAddress,
			actualAmount: (normalized as any)?.amount,
			actualAmountType: typeof (normalized as any)?.amount,
			allKeys: Object.keys(parsed || {}),
			keyTypes: Object.keys(parsed || {}).map((key) => `${key}: ${typeof (parsed as any)?.[key]}`)
		};

		console.log('🔍 Enhanced structure validation:', validationResults);

		// Check if it matches our StarknetReceiveData format (support both field names)
		const hasValidStructure =
			validationResults.isObject &&
			validationResults.hasRecipientAddress &&
			validationResults.hasAmount &&
			validationResults.hasCorrectNetwork;

		if (hasValidStructure) {
			// Validate the recipient address
			const addressValid = isValidStarknetAddress((normalized as any).recipientAddress as string);
			console.log('🏠 Address validation:', {
				address: (normalized as any).recipientAddress,
				addressValid,
				addressLength: (parsed.recipientAddress || parsed.address)?.length,
				startsWithOx: (parsed.recipientAddress || parsed.address)?.startsWith('0x')
			});

			if (!addressValid) {
				const error = 'Invalid Starknet address in invoice';
				console.error('❌ Address validation failed:', {
					address: parsed.recipientAddress || parsed.address,
					expectedFormat: 'Starts with 0x, length 63-66 chars',
					error
				});
				throw new Error(error);
			}

			// Validate the amount
			const amountValid =
				(normalized as any).amount > 0 && Number.isInteger((normalized as any).amount as number);
			console.log('💰 Amount validation:', {
				amount: (normalized as any).amount,
				amountType: typeof parsed.amount,
				amountValid,
				isPositive: parsed.amount > 0,
				isInteger: Number.isInteger(parsed.amount)
			});

			if (!amountValid) {
				const error = 'Invalid amount in Starknet invoice';
				console.error('❌ Amount validation failed:', {
					amount: parsed.amount,
					expectedFormat: 'Positive integer',
					error
				});
				throw new Error(error);
			}

			const starknetData: StarknetReceiveData = {
				recipientAddress: (normalized as any).recipientAddress as string,
				amount: (normalized as any).amount as number,
				network: 'Starknet'
			};

			console.log('✅ Starknet invoice successfully parsed:', {
				recipientPreview: `${((normalized as any).recipientAddress as string)?.substring(0, 10)}...${((normalized as any).recipientAddress as string)?.substring(((normalized as any).recipientAddress as string)?.length - 8)}`,
				amount: (normalized as any).amount,
				network: (normalized as any).network,
				success: true
			});

			return {
				type: QRDataType.STARKNET_INVOICE,
				rawData: data,
				parsedData: starknetData,
				isValid: true
			};
		}

		// Enhanced error reporting with specific issues
		const validationIssues: string[] = [];

		if (!validationResults.isObject) {
			validationIssues.push('Data is not a valid JSON object');
		}

		if (!validationResults.hasRecipientAddress && !validationResults.hasAddress) {
			if (parsed?.recipientAddress !== undefined || parsed?.address !== undefined) {
				validationIssues.push(
					`recipientAddress or address should be a string, got ${typeof (parsed?.recipientAddress || parsed?.address)}`
				);
			} else {
				validationIssues.push('Missing recipientAddress or address field');
			}
		}

		if (!validationResults.hasAmount) {
			if (parsed?.amount !== undefined) {
				validationIssues.push(`amount should be a number, got ${typeof parsed.amount}`);
			} else {
				validationIssues.push('Missing amount field');
			}
		}

		if (!validationResults.hasCorrectNetwork) {
			if (parsed?.network !== undefined) {
				validationIssues.push(`network should be exactly "Starknet", got "${parsed.network}"`);
			} else {
				validationIssues.push('Missing network field');
			}
		}

		const structureError = `JSON does not match Starknet invoice format. Issues: ${validationIssues.join(', ')}`;
		console.log('❌ Structure validation failed:', {
			error: structureError,
			expectedFields: [
				'recipientAddress (string) or address (string)',
				'amount (number)',
				'network ("Starknet")'
			],
			actualFields: validationResults.keyTypes,
			actualData: parsed,
			validationIssues
		});

		return {
			type: QRDataType.UNKNOWN,
			rawData: data,
			parsedData: null,
			isValid: false,
			error: structureError
		};
	} catch (error) {
		// Not valid JSON or parsing failed
		console.error('❌ Starknet invoice parsing failed:', {
			error: error instanceof Error ? error.message : String(error),
			dataPreview: data?.substring(0, 100),
			isValidJSON: false,
			timestamp: new Date().toISOString()
		});

		// Check if it looks like JSON but failed to parse
		if (data?.trim().startsWith('{') && data?.trim().endsWith('}')) {
			return {
				type: QRDataType.UNKNOWN,
				rawData: data,
				parsedData: null,
				isValid: false,
				error: `Invalid JSON format: ${error instanceof Error ? error.message : 'Parsing failed'}`
			};
		}

		return {
			type: QRDataType.UNKNOWN,
			rawData: data,
			parsedData: null,
			isValid: false,
			error: `Starknet parsing error: ${error instanceof Error ? error.message : 'Not valid JSON'}`
		};
	}
}

/**
 * Test function to validate Starknet invoice format
 * This helps debug QR code generation and parsing issues
 */
export function testStarknetInvoiceFormat(): void {
	console.log('🧪 Testing Starknet invoice format...');

	// Test case 1: Valid data
	const validData = {
		recipientAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
		amount: 50000,
		network: 'Starknet'
	};

	console.log('Test case 1 - Valid data:', validData);
	const validJson = JSON.stringify(validData);
	console.log('Valid JSON:', validJson);

	const validResult = parseStarknetInvoice(validJson);
	console.log('Valid result:', validResult);

	// Test case 2: Invalid network
	const invalidNetworkData = {
		recipientAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
		amount: 50000,
		network: 'starknet' // lowercase
	};

	console.log('Test case 2 - Invalid network:', invalidNetworkData);
	const invalidNetworkJson = JSON.stringify(invalidNetworkData);
	console.log('Invalid network JSON:', invalidNetworkJson);

	const invalidNetworkResult = parseStarknetInvoice(invalidNetworkJson);
	console.log('Invalid network result:', invalidNetworkResult);

	// Test case 3: String amount
	const invalidAmountData = {
		recipientAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
		amount: '50000', // string instead of number
		network: 'Starknet'
	};

	console.log('Test case 3 - Invalid amount type:', invalidAmountData);
	const invalidAmountJson = JSON.stringify(invalidAmountData);
	console.log('Invalid amount JSON:', invalidAmountJson);

	const invalidAmountResult = parseStarknetInvoice(invalidAmountJson);
	console.log('Invalid amount result:', invalidAmountResult);

	// Test case 4: Test with actual data structure from the app
	console.log('🧪 Test case 4 - Testing with actual app data structure');
	const appData = {
		recipientAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
		amount: 50000,
		network: 'Starknet'
	};

	console.log('App data structure:', appData);
	const appJson = JSON.stringify(appData);
	console.log('App JSON:', appJson);

	const appResult = parseStarknetInvoice(appJson);
	console.log('App result:', appResult);

	// Test case 5: Test with the exact error case (missing recipientAddress)
	console.log('🧪 Test case 5 - Testing missing recipientAddress field');
	const missingAddressData = {
		amount: 50000,
		network: 'Starknet'
	};

	console.log('Missing address data:', missingAddressData);
	const missingAddressJson = JSON.stringify(missingAddressData);
	console.log('Missing address JSON:', missingAddressJson);

	const missingAddressResult = parseStarknetInvoice(missingAddressJson);
	console.log('Missing address result:', missingAddressResult);

	// Test case 6: Test with the new standardized format (recipientAddress)
	console.log('🧪 Test case 6 - Testing new standardized format');
	const standardizedData = {
		recipientAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
		amount: 50000,
		network: 'Starknet'
	};

	console.log('Standardized data:', standardizedData);
	const standardizedJson = JSON.stringify(standardizedData);
	console.log('Standardized JSON:', standardizedJson);

	const standardizedResult = parseStarknetInvoice(standardizedJson);
	console.log('Standardized result:', standardizedResult);

	console.log('🧪 Starknet invoice format testing complete');
}

/**
 * Identify QR data type without full parsing (faster)
 */
export function identifyQRType(data: string): QRDataType {
	if (!data || typeof data !== 'string') {
		return QRDataType.UNKNOWN;
	}

	const trimmedData = data.trim().toLowerCase();

	// Lightning patterns
	if (
		trimmedData.startsWith('lnbc') ||
		trimmedData.startsWith('lntb') ||
		trimmedData.startsWith('lnurl') ||
		(data.includes('@') && isValidLightningAddress(data))
	) {
		return QRDataType.LIGHTNING_INVOICE;
	}

	// Bitcoin patterns
	if (trimmedData.startsWith('bitcoin:') || isValidBitcoinAddress(data.trim())) {
		return QRDataType.BITCOIN_ADDRESS;
	}

	// Starknet pattern (JSON)
	if (trimmedData.startsWith('{') && trimmedData.endsWith('}')) {
		try {
			const parsed = JSON.parse(data);
			// Support compact keys { r, a, n } and standard keys
			const r = parsed.recipientAddress || parsed.address || parsed.r;
			const a = parsed.amount ?? parsed.a;
			const rawN = parsed.network ?? parsed.n;
			const n =
				typeof rawN === 'string' && rawN.length === 1 && rawN.toUpperCase() === 'S'
					? 'Starknet'
					: rawN;
			if (
				parsed &&
				typeof parsed === 'object' &&
				n === 'Starknet' &&
				typeof r === 'string' &&
				typeof a === 'number'
			) {
				return QRDataType.STARKNET_INVOICE;
			}
		} catch {
			// Not valid JSON
		}
	}

	return QRDataType.UNKNOWN;
}

/**
 * Get human-readable description of QR data type
 */
export function getQRTypeDescription(type: QRDataType): string {
	switch (type) {
		case QRDataType.LIGHTNING_INVOICE:
			return 'Lightning Invoice';
		case QRDataType.BITCOIN_ADDRESS:
			return 'Bitcoin Address';
		case QRDataType.STARKNET_INVOICE:
			return 'Starknet Invoice';
		case QRDataType.UNKNOWN:
		default:
			return 'Unknown Format';
	}
}

/**
 * Get icon for QR data type
 */
export function getQRTypeIcon(type: QRDataType): string {
	switch (type) {
		case QRDataType.LIGHTNING_INVOICE:
			return '⚡';
		case QRDataType.BITCOIN_ADDRESS:
			return '₿';
		case QRDataType.STARKNET_INVOICE:
			return '🌐';
		case QRDataType.UNKNOWN:
		default:
			return '❓';
	}
}
