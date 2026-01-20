/**
 * @fileoverview Payment Utilities
 *
 * Shared utilities for payment processing, formatting, and clipboard operations
 * used across Lightning and Bitcoin payment components.
 *
 * @author bim
 * @version 1.0.0
 */

/**
 * Copy text to clipboard with error handling
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			// Use modern clipboard API
			await navigator.clipboard.writeText(text);
			return true;
		} else {
			// Fallback for older browsers or non-secure contexts
			const textArea = document.createElement('textarea');
			textArea.value = text;
			textArea.style.position = 'fixed';
			textArea.style.left = '-999999px';
			textArea.style.top = '-999999px';
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();

			const successful = document.execCommand('copy');
			document.body.removeChild(textArea);
			return successful;
		}
	} catch (error) {
		console.error('Failed to copy to clipboard:', error);
		return false;
	}
}

/**
 * Format satoshi amount for display with proper number formatting
 */
export function formatSats(sats: number): string {
	return new Intl.NumberFormat().format(sats);
}

/**
 * Convert amount between different display modes
 */
export function convertAmount(sats: number, mode: 'sats' | 'btc' | 'usd'): string {
	switch (mode) {
		case 'btc':
			return (sats / 100_000_000).toFixed(8);
		case 'usd':
			// Placeholder - would need actual BTC/USD rate from a price API
			const btc = sats / 100_000_000;
			const usdRate = 45000; // Placeholder rate
			return (btc * usdRate).toFixed(2);
		case 'sats':
		default:
			return formatSats(sats);
	}
}

/**
 * Get display unit for amount mode
 */
export function getDisplayUnit(mode: 'sats' | 'btc' | 'usd'): string {
	switch (mode) {
		case 'btc':
			return 'BTC';
		case 'usd':
			return 'USD';
		case 'sats':
		default:
			return 'sats';
	}
}

/**
 * Validate Lightning address format
 */
export function isValidLightningAddress(address: string): boolean {
	// BOLT11 invoice format
	if (address.toLowerCase().startsWith('lnbc') || address.toLowerCase().startsWith('lntb')) {
		return address.length > 20; // Basic length check
	}

	// Lightning address format (user@domain.com)
	if (address.includes('@')) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(address);
	}

	// LNURL format
	if (address.toLowerCase().startsWith('lnurl')) {
		return address.length > 10;
	}

	return false;
}

/**
 * Validate Starknet address format
 */
export function isValidStarknetAddress(address: string): boolean {
	const result = address.startsWith('0x') && address.length >= 63 && address.length <= 66;

	// Enhanced logging for debugging QR scanning issues
	console.log('🏠 isValidStarknetAddress() validation:', {
		address: address?.substring(0, 20) + '...',
		fullAddress: address,
		addressLength: address?.length,
		addressType: typeof address,
		startsWithOx: address?.startsWith('0x'),
		lengthInRange: address?.length >= 63 && address?.length <= 66,
		result,
		timestamp: new Date().toISOString()
	});

	return result;
}

/**
 * Validate Bitcoin address format (basic validation)
 */
export function isValidBitcoinAddress(address: string): boolean {
	// Basic validation for common Bitcoin address formats
	const p2pkhRegex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/; // Legacy P2PKH
	const p2shRegex = /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/; // P2SH
	const bech32Regex = /^(bc1|tb1)[a-z0-9]{39,59}$/; // Bech32 (SegWit)

	return p2pkhRegex.test(address) || p2shRegex.test(address) || bech32Regex.test(address);
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string | Date): string {
	const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
	return date.toLocaleString();
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	} else {
		return `${seconds}s`;
	}
}

/**
 * Calculate fee percentage
 */
export function calculateFeePercentage(amount: number, fee: number): number {
	if (amount === 0) return 0;
	return (fee / amount) * 100;
}

/**
 * Format fee information for display
 */
export function formatFeeInfo(fees: { fixed: number; percentage: number; total: number }): string {
	const fixedSats = formatSats(fees.fixed);
	const percentStr = (fees.percentage * 100).toFixed(2);
	const totalSats = formatSats(fees.total);

	return `${fixedSats} sats + ${percentStr}% = ${totalSats} sats total`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.substring(0, maxLength) + '...';
}

/**
 * Generate a short ID from a longer identifier
 */
export function generateShortId(fullId: string, length: number = 8): string {
	if (fullId.length <= length) return fullId;
	return fullId.substring(0, length);
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: NodeJS.Timeout;

	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

/**
 * Check if amount is within limits
 */
export function isAmountWithinLimits(
	amount: number,
	limits: { minAmount: number; maxAmount: number } | null
): { valid: boolean; error?: string } {
	if (!limits) {
		return { valid: true };
	}

	if (amount < limits.minAmount) {
		return {
			valid: false,
			error: `Minimum amount is ${formatSats(limits.minAmount)} sats`
		};
	}

	if (amount > limits.maxAmount) {
		return {
			valid: false,
			error: `Maximum amount is ${formatSats(limits.maxAmount)} sats`
		};
	}

	return { valid: true };
}
