import { logger } from './logger';

export class CalldataUtils {
	/**
	 * Function to validate and format calldata for Felt compatibility
	 * @param calldata - The calldata array to validate and format
	 * @param callIndex - The index of the call for logging purposes
	 * @returns Array of formatted calldata values as hex strings
	 */
	static validateAndFormatCalldata(calldata: any[], callIndex: number): string[] {
		if (!Array.isArray(calldata)) {
			logger.warn(`Call ${callIndex}: calldata is not an array, converting`, {
				calldata,
				type: typeof calldata
			});
			return [];
		}

		return calldata.map((val, calldataIndex) => {
			try {
				// Handle null/undefined values
				if (val === null || val === undefined) {
					logger.debug(
						`Call ${callIndex} calldata[${calldataIndex}]: null/undefined value, using 0x0`
					);
					return '0x0';
				}

				// If already a hex string, validate it's a valid hex
				if (typeof val === 'string' && val.startsWith('0x')) {
					// Validate hex format
					if (!/^0x[0-9a-fA-F]+$/.test(val)) {
						logger.warn(
							`Call ${callIndex} calldata[${calldataIndex}]: invalid hex format "${val}", using 0x0`
						);
						return '0x0';
					}

					// Check if the hex value is too large for Felt (> 2^251)
					try {
						const bigIntVal = BigInt(val);
						const maxFelt = BigInt(
							'0x800000000000011000000000000000000000000000000000000000000000001'
						); // 2^251 - 1

						if (bigIntVal > maxFelt) {
							logger.warn(
								`Call ${callIndex} calldata[${calldataIndex}]: value too large for Felt "${val}", using 0x0`
							);
							return '0x0';
						}
					} catch (bigIntError) {
						logger.warn(
							`Call ${callIndex} calldata[${calldataIndex}]: BigInt conversion failed for "${val}", using 0x0`
						);
						return '0x0';
					}

					return val;
				}

				// Handle string numbers (decimal)
				if (typeof val === 'string' && /^\d+$/.test(val)) {
					try {
						const bigIntVal = BigInt(val);
						const maxFelt = BigInt(
							'0x800000000000011000000000000000000000000000000000000000000000001'
						);

						if (bigIntVal > maxFelt) {
							logger.warn(
								`Call ${callIndex} calldata[${calldataIndex}]: decimal value too large for Felt "${val}", using 0x0`
							);
							return '0x0';
						}

						return `0x${bigIntVal.toString(16)}`;
					} catch (error) {
						logger.warn(
							`Call ${callIndex} calldata[${calldataIndex}]: failed to convert decimal "${val}", using 0x0`
						);
						return '0x0';
					}
				}

				// Handle numbers and BigInts
				if (typeof val === 'number' || typeof val === 'bigint') {
					try {
						const bigIntVal = BigInt(val);
						const maxFelt = BigInt(
							'0x800000000000011000000000000000000000000000000000000000000000001'
						);

						if (bigIntVal > maxFelt) {
							logger.warn(
								`Call ${callIndex} calldata[${calldataIndex}]: numeric value too large for Felt "${val}", using 0x0`
							);
							return '0x0';
						}

						if (bigIntVal < 0) {
							logger.warn(
								`Call ${callIndex} calldata[${calldataIndex}]: negative value "${val}", using 0x0`
							);
							return '0x0';
						}

						return `0x${bigIntVal.toString(16)}`;
					} catch (error) {
						logger.warn(
							`Call ${callIndex} calldata[${calldataIndex}]: failed to convert numeric "${val}", using 0x0`
						);
						return '0x0';
					}
				}

				// Handle other string values (non-numeric)
				if (typeof val === 'string') {
					logger.warn(
						`Call ${callIndex} calldata[${calldataIndex}]: non-numeric string "${val}", using 0x0`
					);
					return '0x0';
				}

				// For any other type, use 0x0
				logger.warn(
					`Call ${callIndex} calldata[${calldataIndex}]: unsupported type "${typeof val}", value: "${val}", using 0x0`
				);
				return '0x0';
			} catch (error) {
				logger.error(
					`Call ${callIndex} calldata[${calldataIndex}]: error processing value "${val}":`,
					error as Error
				);
				return '0x0';
			}
		});
	}
}
