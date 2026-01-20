import { hash } from 'starknet';
import { logger } from './logger';
import { JsonUtils } from './json-utils';

export class SelectorUtils {
	/**
	 * Converts string selectors to hex format using getSelectorFromName
	 * @param selector - The selector (string or hex)
	 * @returns Hex selector starting with 0x
	 */
	static convertSelectorToHex(selector: string): string {
		// If already hex format, return as-is
		if (selector.startsWith('0x')) {
			return selector;
		}

		try {
			// Use hash.getSelectorFromName from starknet.js to convert string to hex
			const hexSelector = hash.getSelectorFromName(selector);
			logger.debug('Converted string selector to hex', {
				originalSelector: selector,
				hexSelector
			});
			return hexSelector;
		} catch (error) {
			logger.warn('Failed to convert selector to hex, using original', {
				selector,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			return selector;
		}
	}

	/**
	 * Recursively converts all string selectors in transaction calls to hex format
	 * @param transaction - The transaction object to process
	 * @returns Transaction with hex selectors
	 */
	static convertTransactionSelectorsToHex(transaction: any): any {
		if (!transaction || typeof transaction !== 'object') {
			return transaction;
		}

		// Clone the transaction to avoid mutating the original
		// Use JsonUtils.sanitizeBigIntToHex to handle BigInt values safely
		const processedTransaction = JsonUtils.sanitizeBigIntToHex(transaction);

		// Process transaction calls if present
		if (processedTransaction.tx && Array.isArray(processedTransaction.tx)) {
			processedTransaction.tx = processedTransaction.tx.map((call: any) => {
				if (call && typeof call === 'object') {
					// Convert entrypoint selector if present
					if (call.entrypoint && typeof call.entrypoint === 'string') {
						call.entrypoint = SelectorUtils.convertSelectorToHex(call.entrypoint);
					}
					// Also handle 'selector' field if present
					if (call.selector && typeof call.selector === 'string') {
						call.selector = SelectorUtils.convertSelectorToHex(call.selector);
					}
				}
				return call;
			});
		}

		// Also handle direct calls array if transaction structure is different
		if (processedTransaction.calls && Array.isArray(processedTransaction.calls)) {
			processedTransaction.calls = processedTransaction.calls.map((call: any) => {
				if (call && typeof call === 'object') {
					if (call.entrypoint && typeof call.entrypoint === 'string') {
						call.entrypoint = SelectorUtils.convertSelectorToHex(call.entrypoint);
					}
					if (call.selector && typeof call.selector === 'string') {
						call.selector = SelectorUtils.convertSelectorToHex(call.selector);
					}
				}
				return call;
			});
		}

		return processedTransaction;
	}
}
