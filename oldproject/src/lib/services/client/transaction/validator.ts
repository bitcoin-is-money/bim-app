import { logger } from '$lib/utils/logger';
import type { UnsignedTransaction } from './types';

/**
 * Transaction validator responsible for validating transaction structure
 * before signing to ensure they conform to expected formats
 */
export class TransactionValidator {
	/**
	 * Validate transaction before signing
	 */
	validateTransaction(tx: UnsignedTransaction, swapId: string): void {
		if (!tx) {
			throw new Error('Transaction is null or undefined');
		}

		if (!tx.type) {
			throw new Error('Transaction type is missing');
		}

		if (!tx.tx) {
			throw new Error('Transaction data (tx.tx) is missing');
		}

		// Validate INVOKE transaction structure according to official Atomiq SDK format
		// Expected format: { type: "INVOKE", tx: Array<Call>, details: {...} }
		if (tx.type === 'INVOKE') {
			this.validateInvokeTransaction(tx, swapId);
		} else if (tx.type === 'DEPLOY_ACCOUNT') {
			this.validateDeployAccountTransaction(tx, swapId);
		}

		this.logTransactionStructure(tx, swapId);
	}

	/**
	 * Validate INVOKE transaction structure
	 */
	private validateInvokeTransaction(tx: UnsignedTransaction, swapId: string): void {
		// Log the actual structure for debugging
		logger.info('Validating INVOKE transaction structure', {
			swapId,
			txType: typeof tx.tx,
			isArray: Array.isArray(tx.tx),
			txKeys: tx.tx ? Object.keys(tx.tx) : [],
			txStructure: tx.tx
				? {
						type: typeof tx.tx,
						keys: Object.keys(tx.tx),
						hasTx: !!tx.tx.tx,
						txKeys: tx.tx.tx ? Object.keys(tx.tx.tx) : []
					}
				: null
		});

		// Handle both array format and object format
		let calls: any[] = [];

		if (Array.isArray(tx.tx)) {
			// Direct array format
			calls = tx.tx;
		} else if (tx.tx && typeof tx.tx === 'object' && tx.tx.tx && Array.isArray(tx.tx.tx)) {
			// Nested array format: { tx: Array<Call> }
			calls = tx.tx.tx;
		} else {
			const txStructure = tx.tx
				? {
						type: typeof tx.tx,
						isArray: Array.isArray(tx.tx),
						keys: Object.keys(tx.tx),
						hasTx: !!tx.tx.tx,
						txType: tx.tx.tx ? typeof tx.tx.tx : 'undefined',
						txIsArray: tx.tx.tx ? Array.isArray(tx.tx.tx) : false
					}
				: 'null/undefined';

			throw new Error(
				`INVOKE transaction tx field should be Array<Call> or {tx: Array<Call>}, got: ${typeof tx.tx}. Structure: ${JSON.stringify(txStructure)}`
			);
		}

		if (calls.length === 0) {
			throw new Error('INVOKE transaction calls array is empty');
		}

		// Validate each Call in the array
		this.validateCalls(calls, swapId);
	}

	/**
	 * Validate individual calls within an INVOKE transaction
	 */
	private validateCalls(calls: any[], swapId: string): void {
		calls.forEach((call: any, index: number) => {
			if (!call || typeof call !== 'object') {
				throw new Error(`Call[${index}] is not an object`);
			}

			// Validate contractAddress
			if (typeof call.contractAddress !== 'string') {
				const availableFields = Object.keys(call).join(', ');
				throw new Error(
					`Call[${index}].contractAddress should be string, got: ${typeof call.contractAddress}. Available fields: [${availableFields}]`
				);
			}

			// Validate entrypoint
			if (typeof call.entrypoint !== 'string') {
				const availableFields = Object.keys(call).join(', ');
				throw new Error(
					`Call[${index}].entrypoint should be string, got: ${typeof call.entrypoint}. Available fields: [${availableFields}]`
				);
			}

			// Validate calldata
			if (!Array.isArray(call.calldata)) {
				const availableFields = Object.keys(call).join(', ');
				logger.error('Call calldata is not an array', undefined, {
					swapId,
					callIndex: index,
					calldataType: typeof call.calldata,
					calldataValue: call.calldata,
					availableFields,
					callStructure: JSON.stringify(call, null, 2)
				});
				throw new Error(
					`Call[${index}].calldata should be array, got: ${typeof call.calldata}. Available fields: [${availableFields}]`
				);
			}

			// Check for null/undefined values in calldata array
			const nullIndices = call.calldata
				.map((item: any, itemIndex: number) =>
					item === null || item === undefined ? itemIndex : -1
				)
				.filter((itemIndex: number) => itemIndex !== -1);

			if (nullIndices.length > 0) {
				throw new Error(
					`Call[${index}].calldata contains null/undefined values at indices: ${nullIndices.join(', ')}`
				);
			}
		});
	}

	/**
	 * Validate DEPLOY_ACCOUNT transaction structure
	 */
	private validateDeployAccountTransaction(tx: UnsignedTransaction, swapId: string): void {
		// Add specific validation for DEPLOY_ACCOUNT transactions if needed
		logger.info('Validating DEPLOY_ACCOUNT transaction structure', {
			swapId,
			txType: typeof tx.tx,
			txKeys: tx.tx ? Object.keys(tx.tx) : []
		});
	}

	/**
	 * Log transaction details for transparency
	 */
	private logTransactionStructure(tx: UnsignedTransaction, swapId: string): void {
		let txStructureInfo: any = {};

		if (tx.type === 'INVOKE') {
			// Handle both array format and object format for logging
			let calls: any[] = [];
			if (Array.isArray(tx.tx)) {
				calls = tx.tx;
			} else if (tx.tx && typeof tx.tx === 'object' && tx.tx.tx && Array.isArray(tx.tx.tx)) {
				calls = tx.tx.tx;
			}

			txStructureInfo = {
				type: 'INVOKE',
				callCount: calls.length,
				calls: calls.map((call: any, index: number) => ({
					index,
					contractAddress: call?.contractAddress,
					entrypoint: call?.entrypoint,
					calldataLength: Array.isArray(call?.calldata) ? call.calldata.length : 0
				}))
			};
		} else if (tx.type === 'DEPLOY_ACCOUNT') {
			txStructureInfo = {
				type: 'DEPLOY_ACCOUNT',
				keys: tx.tx ? Object.keys(tx.tx) : []
			};
		}

		logger.info('Transaction structure validated', {
			swapId,
			txType: tx.type,
			structure: txStructureInfo,
			hasDetails: !!tx.details
		});
	}
}
