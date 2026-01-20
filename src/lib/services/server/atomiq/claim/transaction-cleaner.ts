/**
 * @fileoverview Transaction Cleaning Service
 *
 * Handles transaction object cleaning and value extraction for swap claims.
 * Extracted from SwapClaimerService for better separation of concerns.
 */

import { logger } from '$lib/utils/logger';

export class TransactionCleaner {
	/**
	 * Cleans transaction object by extracting primitive values
	 */
	cleanTransactionObject(tx: any): any {
		if (!tx || typeof tx !== 'object') {
			return tx;
		}

		const cleaned: any = { ...tx };

		// Clean the tx field if it's an array of calls
		if (Array.isArray(tx.tx)) {
			cleaned.tx = tx.tx.map((call: any) => ({
				contractAddress: this.extractPrimitiveValue(call.contractAddress, 'contractAddress'),
				entrypoint: this.extractPrimitiveValue(call.entrypoint, 'entrypoint'),
				calldata: this.extractPrimitiveValue(call.calldata, 'calldata')
			}));
		}

		return cleaned;
	}

	/**
	 * Extracts primitive value from potentially nested transaction objects
	 */
	extractPrimitiveValue(value: any, fieldName: string): any {
		// If the value is already primitive, return it
		if (value === null || value === undefined || typeof value !== 'object') {
			return value;
		}

		// If the value is an array (e.g., calldata), return it directly
		if (Array.isArray(value)) {
			return value;
		}

		// If it's a nested transaction object, try to extract the field we're looking for
		if (typeof value === 'object') {
			// Special case for calldata - look for calldata field in nested object
			if (fieldName === 'calldata' && value.calldata && Array.isArray(value.calldata)) {
				return value.calldata;
			}

			// For contractAddress, look for the contractAddress field in the nested object
			if (fieldName === 'contractAddress') {
				if (typeof value.contractAddress === 'string') {
					return value.contractAddress;
				}
				if (typeof value.to === 'string') {
					return value.to;
				}
			}

			// For entrypoint, look for the entrypoint field in the nested object
			if (fieldName === 'entrypoint') {
				if (typeof value.entrypoint === 'string') {
					return value.entrypoint;
				}
				if (typeof value.selector === 'string') {
					return value.selector;
				}
			}

			// If we can't extract a meaningful primitive, log the structure and return the object
			logger.warn('Could not extract primitive value from nested object', {
				fieldName,
				valueType: typeof value,
				valueKeys: Object.keys(value)
			});
		}

		return value;
	}

	/**
	 * Validates and cleans a batch of transactions
	 */
	cleanTransactionBatch(transactions: any[]): any[] {
		if (!Array.isArray(transactions)) {
			throw new Error('Expected transactions to be an array');
		}

		return transactions.map((tx, index) => {
			try {
				return this.cleanTransactionObject(tx);
			} catch (error) {
				logger.error(`Failed to clean transaction at index ${index}`, error as Error, { tx });
				throw new Error(
					`Transaction cleaning failed at index ${index}: ${(error as Error).message}`
				);
			}
		});
	}
}
