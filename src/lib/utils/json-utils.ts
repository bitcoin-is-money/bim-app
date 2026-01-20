import { logger } from './logger';

export class JsonUtils {
	/**
	 * Helper function to safely serialize BigInt values
	 * @param obj - The object to serialize
	 * @returns JSON string with BigInt values converted to strings
	 */
	static safeJsonStringify(obj: any): string {
		return JSON.stringify(
			obj,
			(_, value) => (typeof value === 'bigint' ? value.toString() : value),
			2
		);
	}

	/**
	 * Recursive function to sanitize BigInt values to hex strings for API serialization
	 * @param obj - The object to sanitize
	 * @returns Object with BigInt values converted to hex strings
	 */
	static sanitizeBigIntToHex(obj: any): any {
		if (obj === null || obj === undefined) {
			return obj;
		}

		if (typeof obj === 'bigint') {
			return `0x${obj.toString(16)}`;
		}

		if (typeof obj === 'number') {
			// Convert large numbers to hex strings to avoid precision issues
			if (obj > Number.MAX_SAFE_INTEGER) {
				return `0x${BigInt(obj).toString(16)}`;
			}
			return obj;
		}

		if (typeof obj === 'string') {
			// If it's a decimal string that could be a large number, convert to hex
			if (/^\d+$/.test(obj) && obj.length > 15) {
				try {
					return `0x${BigInt(obj).toString(16)}`;
				} catch {
					return obj; // Return original if conversion fails
				}
			}
			return obj;
		}

		if (Array.isArray(obj)) {
			return obj.map(JsonUtils.sanitizeBigIntToHex);
		}

		if (typeof obj === 'object') {
			const sanitized: any = {};
			for (const [key, value] of Object.entries(obj)) {
				sanitized[key] = JsonUtils.sanitizeBigIntToHex(value);
			}
			return sanitized;
		}

		return obj;
	}

	/**
	 * Function to validate payload can be JSON serialized
	 * @param payload - The payload to validate
	 * @param description - Description of the payload for logging
	 * @throws Error if payload cannot be serialized
	 */
	static validatePayloadSerialization(payload: any, description: string): void {
		try {
			JSON.stringify(payload);
			logger.info(`✅ ${description} payload serialization test passed`);
		} catch (error) {
			logger.error(`❌ ${description} payload serialization test failed`, error as Error, {
				payloadKeys: payload ? Object.keys(payload) : 'null',
				payloadType: typeof payload
			});
			throw new Error(
				`${description} payload contains non-serializable data: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Function to validate and normalize chain ID
	 * @param chainId - The chain ID to validate and normalize
	 * @returns Normalized chain ID string
	 */
	static validateAndNormalizeChainId(chainId: string): string {
		if (!chainId) {
			logger.warn('Empty chain ID provided, using SN_MAIN fallback');
			return 'SN_MAIN';
		}

		// If it's already in the correct format (SN_MAIN, SN_SEPOLIA), return as-is
		if (chainId === 'SN_MAIN' || chainId === 'SN_SEPOLIA') {
			logger.info(`✅ Chain ID is in standard format: ${chainId}`);
			return chainId;
		}

		// If it's a hex chain ID, convert it to standard format
		if (chainId.startsWith('0x')) {
			// Convert hex chain IDs to standard format
			const chainIdMapping: { [key: string]: string } = {
				'0x534e5f4d41494e': 'SN_MAIN', // Mainnet
				'0x534e5f5345504f4c4941': 'SN_SEPOLIA' // Sepolia testnet
			};

			if (chainIdMapping[chainId]) {
				const normalizedChainId = chainIdMapping[chainId];
				logger.info(
					`✅ Converted hex chain ID to standard format: ${chainId} -> ${normalizedChainId}`
				);
				return normalizedChainId;
			} else {
				logger.warn(`⚠️ Unknown hex chain ID: ${chainId}, using as-is`);
				return chainId;
			}
		}

		// For any other format, log a warning but use as-is
		logger.warn(`⚠️ Unusual chain ID format: ${chainId}, using as-is`);
		return chainId;
	}
}
