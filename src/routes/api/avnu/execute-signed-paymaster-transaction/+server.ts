import { AVNU_SERVER_CONFIG } from '$lib/config/avnu-server.config';
import { AVNU_CONFIG } from '$lib/config/avnu.config';
import { ServerPrivateEnv } from '$lib/config/server';
import { authMiddleware } from '$lib/middleware/auth';
import { CalldataUtils } from '$lib/utils/calldata-utils';
import { JsonUtils } from '$lib/utils/json-utils';
import { logger } from '$lib/utils/logger';
import { SignerType, signerTypeToCustomEnum } from '$lib/utils/starknet';
import { triggerScanAfterPayment } from '$lib/utils/transaction-completion';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { CairoCustomEnum, PaymasterRpc, RpcProvider, type ExecutionParameters } from 'starknet';

export const POST = async (event: RequestEvent) => {
	try {
		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const { accountAddress, calls, signature, typedData, paymentMethod } =
			await event.request.json();

		if (!accountAddress || !calls || !signature || !typedData || !paymentMethod) {
			return json(
				{
					error:
						'Missing required parameters: accountAddress, calls, signature, typedData, paymentMethod'
				},
				{ status: 400 }
			);
		}

		// Add detailed execution flow detection logging
		const callsSignature = JSON.stringify(calls);
		const executionMarkers = {
			hasCommitSelector: calls.some(
				(call) =>
					(call.selector && call.selector.includes('commit')) ||
					(call.entrypoint && call.entrypoint.includes('commit'))
			),
			hasClaimSelector: calls.some(
				(call) =>
					(call.selector && call.selector.includes('claim')) ||
					(call.entrypoint && call.entrypoint.includes('claim'))
			),
			callsContainAtomiqContract: calls.some(
				(call) =>
					(call.to && call.to.includes('atomiq')) ||
					(call.contractAddress && call.contractAddress.includes('atomiq'))
			),
			callsHash: createHash('sha256').update(callsSignature).digest('hex').substring(0, 16),
			firstCallDetails: calls[0]
				? {
						to: calls[0].to,
						selector: calls[0].selector,
						contractAddress: calls[0].contractAddress,
						entrypoint: calls[0].entrypoint
					}
				: null
		};

		logger.info('🚨 EXECUTION TRACKING: Processing signed transaction', {
			...executionMarkers,
			accountAddress: accountAddress.substring(0, 10) + '...',
			timestamp: new Date().toISOString(),
			signaturePresent: !!signature,
			typedDataPresent: !!typedData
		});

		// Validate typedData structure for PaymasterRpc
		if (!typedData.types || !typedData.domain || !typedData.primaryType || !typedData.message) {
			logger.error('Invalid typedData structure', new Error('Invalid typedData structure'), {
				typedData: {
					hasTypes: !!typedData.types,
					hasDomain: !!typedData.domain,
					hasPrimaryType: !!typedData.primaryType,
					hasMessage: !!typedData.message
				}
			});
			return json(
				{
					error: 'Invalid typedData structure',
					details: 'typedData must have types, domain, primaryType, and message properties'
				},
				{ status: 400 }
			);
		}

		// Validate that selectors in typedData are properly formatted
		if (typedData.message?.Calls && Array.isArray(typedData.message.Calls)) {
			const invalidSelectors = typedData.message.Calls.filter((call: any, index: number) => {
				const isInvalid = typeof call.Selector === 'string' && !call.Selector.startsWith('0x');
				if (isInvalid) {
					logger.warn(`Invalid selector format in typedData call ${index}:`, {
						selector: call.Selector,
						expected: 'hex string starting with 0x',
						actual: typeof call.Selector
					});
				}
				return isInvalid;
			});

			if (invalidSelectors.length > 0) {
				return json(
					{
						error: 'Invalid selector format in typedData',
						details: `${invalidSelectors.length} calls have string selectors instead of hex format`
					},
					{ status: 400 }
				);
			}
		}

		// Validate and normalize chain ID from typedData
		let actualChainId: string;
		if (typedData.domain?.chainId) {
			actualChainId = JsonUtils.validateAndNormalizeChainId(typedData.domain.chainId);
			logger.info('Using chain ID from typedData domain', {
				originalChainId: typedData.domain.chainId,
				normalizedChainId: actualChainId
			});
		} else {
			// Fallback: detect chain ID from RPC provider
			logger.info('No chain ID in typedData domain, detecting from RPC provider');
			try {
				const provider = new RpcProvider({
					nodeUrl: ServerPrivateEnv.STARKNET_RPC_URL(),
					specVersion: '0.9.0' as const
				});

				const chainIdResponse = await provider.getChainId();
				actualChainId = JsonUtils.validateAndNormalizeChainId(chainIdResponse);

				logger.info('Chain ID detected from RPC provider', {
					rawChainId: chainIdResponse,
					normalizedChainId: actualChainId
				});
			} catch (chainIdError) {
				logger.warn('Failed to detect chain ID, using SN_MAIN as fallback', {
					error: chainIdError instanceof Error ? chainIdError.message : 'Unknown error'
				});
				actualChainId = 'SN_MAIN';
			}
		}

		// Validate calldata in typedData for Felt compatibility
		if (typedData.message?.Calls && Array.isArray(typedData.message.Calls)) {
			logger.info('Validating calldata for Felt compatibility', {
				callCount: typedData.message.Calls.length
			});

			let invalidCalldata = false;
			const validatedCalls = typedData.message.Calls.map((call: any, callIndex: number) => {
				if (call.Calldata && Array.isArray(call.Calldata)) {
					const originalCalldata = [...call.Calldata];
					const validatedCalldata = CalldataUtils.validateAndFormatCalldata(
						call.Calldata,
						callIndex
					);

					// Check if any values were modified (indicating invalid data)
					const wasModified = originalCalldata.some(
						(orig, idx) =>
							orig !== validatedCalldata[idx] && typeof orig === 'string' && orig.length > 15 // Only flag large values that were likely problematic
					);

					if (wasModified) {
						logger.warn(
							`Call ${callIndex}: calldata contained oversized values that were sanitized`,
							{
								originalLength: originalCalldata.length,
								validatedLength: validatedCalldata.length,
								hadOversizedValues: true
							}
						);
					}

					return {
						...call,
						Calldata: validatedCalldata
					};
				}
				return call;
			});

			if (!invalidCalldata) {
				// Do NOT mutate typedData: client signed the original payload.
				logger.info('Calldata validation completed (no mutation applied)', {
					callCount: validatedCalls.length
				});
			} else {
				return json(
					{
						error: 'Invalid calldata format',
						details: 'One or more calldata values are not compatible with Felt format'
					},
					{ status: 400 }
				);
			}
		}

		// Do NOT rewrite typedData.domain.chainId: it must match what was signed.
		if (typedData.domain && typedData.domain.chainId !== actualChainId) {
			logger.info('Chain ID differs from node; preserving client-signed value', {
				clientChainId: typedData.domain.chainId,
				nodeChainId: actualChainId
			});
		}

		if (!Array.isArray(calls) || calls.length === 0) {
			return json(
				{
					error: 'calls must be a non-empty array'
				},
				{ status: 400 }
			);
		}

		logger.info('Executing signed paymaster transaction', {
			accountAddress,
			callCount: calls.length,
			paymentMethod,
			hasSignature: !!signature,
			hasTypedData: !!typedData,
			signatureType: Array.isArray(signature) ? 'array' : typeof signature,
			signatureLength: Array.isArray(signature) ? signature.length : 'not array',
			signatureContent: signature
		});

		// Enhanced debug logging for signature analysis - reduced to avoid rate limiting
		console.log('🔍 DEBUG: Execute-signed-paymaster-transaction received data:', {
			accountAddress,
			callCount: calls.length,
			paymentMethod,
			signature: {
				type: typeof signature,
				isArray: Array.isArray(signature),
				length: Array.isArray(signature) ? signature.length : 'N/A',
				// Don't log full content to avoid rate limiting
				hasContent: !!signature,
				firstElement: Array.isArray(signature) && signature.length > 0 ? signature[0] : 'N/A',
				secondElement: Array.isArray(signature) && signature.length > 1 ? signature[1] : 'N/A'
			},
			typedData: {
				type: typeof typedData,
				keys: typedData ? Object.keys(typedData) : 'N/A',
				// Don't log full objects to avoid rate limiting
				hasDomain: !!typedData?.domain,
				hasMessage: !!typedData?.message,
				primaryType: typedData?.primaryType
			},
			calls: {
				count: calls.length,
				// Don't log full call objects to avoid rate limiting
				hasFirstCall: !!calls[0]
			}
		});

		// Enhanced signature format validation before passing to PaymasterRpc
		if (!signature || (Array.isArray(signature) && signature.length === 0)) {
			logger.error('Invalid signature provided', new Error('Invalid signature provided'), {
				signature,
				signatureType: typeof signature,
				isArray: Array.isArray(signature)
			});
			return json(
				{
					error: 'Invalid signature format',
					details: 'Signature is empty or undefined'
				},
				{ status: 400 }
			);
		}

		// Additional validation for array signatures - check for oversized values
		if (Array.isArray(signature)) {
			const maxFelt = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');
			let hasOversizedValues = false;

			const validatedSignature = signature.map((sigValue, index) => {
				if (typeof sigValue === 'string' && sigValue.length > 15 && /^\d+$/.test(sigValue)) {
					try {
						const bigIntVal = BigInt(sigValue);
						if (bigIntVal > maxFelt) {
							logger.warn(
								`Signature element ${index}: value too large for Felt "${sigValue}", converting to hex`
							);
							return `0x${bigIntVal.toString(16)}`;
						}
					} catch (error) {
						logger.warn(
							`Signature element ${index}: failed to validate "${sigValue}", using as-is`
						);
					}
				}
				return sigValue;
			});

			if (hasOversizedValues) {
				logger.info('Signature contained oversized values that were normalized');
				// Update the signature reference for later use
				signature = validatedSignature;
			}
		}

		// Enhanced signature validation for PaymasterRpc compatibility
		const isWebAuthnSignature =
			signature &&
			typeof signature === 'object' &&
			!Array.isArray(signature) &&
			'ec_signature' in signature;
		const isArraySignature = Array.isArray(signature);
		const isWebAuthnWithSigner =
			signature &&
			typeof signature === 'object' &&
			!Array.isArray(signature) &&
			'signer' in signature &&
			'signature' in signature;

		logger.info('Signature format validation:', {
			signatureType: typeof signature,
			isArray: isArraySignature,
			isWebAuthnObject: isWebAuthnSignature,
			isWebAuthnWithSigner: isWebAuthnWithSigner,
			hasEcSignature: isWebAuthnSignature && !!signature.ec_signature,
			hasSigner: isWebAuthnWithSigner && !!signature.signer,
			hasSignature: isWebAuthnWithSigner && !!signature.signature,
			arrayLength: isArraySignature ? signature.length : 'N/A',
			sha256Implementation:
				isWebAuthnWithSigner && signature.signature
					? signature.signature.sha256_implementation
						? 'present'
						: 'missing'
					: 'N/A'
		});

		// For PaymasterRpc, we now support the full WebAuthn signature structure with signer info
		if (isWebAuthnWithSigner) {
			logger.info(
				'Received WebAuthn signature with signer info - this is the correct format for Argent account validation',
				{
					hasSigner: !!signature.signer,
					hasSignature: !!signature.signature,
					note: 'Full WebAuthn signature structure with signer info for Argent account validation'
				}
			);
		} else if (isArraySignature) {
			logger.info(
				'Received array signature format - this may work but full WebAuthn structure is preferred',
				{
					arrayLength: signature.length,
					note: 'Array format may work but full WebAuthn structure with signer info is more reliable'
				}
			);
		} else if (isWebAuthnSignature) {
			logger.warn(
				'Received basic WebAuthn object format, but full structure with signer info is preferred',
				{
					note: 'Basic WebAuthn object format may work but full structure with signer info is more reliable'
				}
			);
		}

		// Create PaymasterRpc with API key (server-side only)
		const paymasterRpc = new PaymasterRpc({
			nodeUrl: AVNU_CONFIG.API_BASE_URL,
			headers: { 'x-paymaster-api-key': AVNU_SERVER_CONFIG.API_KEY }
		});

		// Prepare the execution structure
		let finalSignature = signature;

		// Helper: build single compact_no_legacy WebAuthn signature layout
		const buildCompactNoLegacy = (sigWithSigner: any) => {
			const toHex = (v: number | string | bigint) =>
				typeof v === 'string' && v.startsWith('0x') ? v : `0x${BigInt(v).toString(16)}`;
			const VARIANT_WEBAUTHN = '0x4';
			const signerPayload = sigWithSigner.signer?.variant?.Webauthn ?? sigWithSigner.signer;
			const originBytes: (number | string)[] = Array.isArray(signerPayload?.origin)
				? signerPayload.origin
				: [];
			const rpLow = signerPayload?.rp_id_hash?.low ?? '0x0';
			const rpHigh = signerPayload?.rp_id_hash?.high ?? '0x0';
			const pkLow = signerPayload?.pubkey?.low ?? '0x0';
			const pkHigh = signerPayload?.pubkey?.high ?? '0x0';
			const sig = sigWithSigner.signature;
			const outroBytes: (number | string)[] = Array.isArray(sig?.client_data_json_outro)
				? sig.client_data_json_outro
				: [];
			const flags = toHex(sig?.flags ?? 0);
			const signCount = toHex(sig?.sign_count ?? 0);
			const rLow = sig?.ec_signature?.r?.low ?? '0x0';
			const rHigh = sig?.ec_signature?.r?.high ?? '0x0';
			const sLow = sig?.ec_signature?.s?.low ?? '0x0';
			const sHigh = sig?.ec_signature?.s?.high ?? '0x0';
			const yParity = toHex(sig?.ec_signature?.y_parity ? 1 : 0);

			// Single signature array: [signatures_len=1, variant=4, signer fields, signature fields]
			return [
				'1',
				VARIANT_WEBAUTHN,
				toHex(originBytes.length),
				...originBytes.map(toHex),
				rpLow,
				rpHigh,
				pkLow,
				pkHigh,
				toHex(outroBytes.length),
				...outroBytes.map(toHex),
				flags,
				signCount,
				rLow,
				rHigh,
				sLow,
				sHigh,
				yParity
			];
		};

		// If we have a WebAuthn signature with signer info, we need to compile it for PaymasterRpc
		if (isWebAuthnWithSigner && signature.signer && signature.signature) {
			try {
				// Quick stats about provided WebAuthn signature
				try {
					const outro = signature.signature?.client_data_json_outro;
					logger.info('WebAuthn signature payload (server-side)', {
						clientDataJsonOutroLen: Array.isArray(outro) ? outro.length : 'N/A',
						clientDataJsonOutroFirst: Array.isArray(outro) ? outro.slice(0, 8) : 'N/A',
						flags: signature.signature?.flags,
						sign_count: signature.signature?.sign_count
					});
				} catch {}
				// Import CallData to compile the WebAuthn signature
				const { CallData } = await import('starknet');

				// Build compact_no_legacy layout only
				finalSignature = buildCompactNoLegacy(signature);
				logger.info('Compiled compact_no_legacy WebAuthn signature for PaymasterRpc', {
					length: Array.isArray(finalSignature) ? finalSignature.length : 'N/A',
					firstFew: Array.isArray(finalSignature) ? finalSignature.slice(0, 6) : 'N/A'
				});
			} catch (compilationError) {
				logger.error(
					'Failed to compile WebAuthn signature for PaymasterRpc',
					compilationError as Error,
					{
						signatureType: typeof signature.signature,
						hasEcSignature: !!signature.signature?.ec_signature,
						errorMessage:
							compilationError instanceof Error ? compilationError.message : 'Unknown error',
						note: 'Attempting fallback signature formats'
					}
				);

				// Try fallback approaches for signature formatting
				if (Array.isArray(signature)) {
					// If signature is already an array, use it directly
					finalSignature = signature;
					logger.info('Using array signature as fallback');
				} else {
					// Final fallback: use original signature
					finalSignature = signature;
					logger.warn('Using original signature format as final fallback');
				}
			}
		}

		const executeTransactionPayload = {
			type: 'invoke' as const,
			invoke: {
				userAddress: accountAddress,
				typedData: typedData, // Include the typedData object from build step
				signature: finalSignature // Use the compiled signature array
				// Note: The signer information is embedded in the compiled signature
				// PaymasterRpc will extract and use this for Argent account validation
			}
		};

		const executeParameters: ExecutionParameters = {
			feeMode: { mode: 'sponsored' as const },
			version: '0x1' as const // PaymasterRpc API version (separate from transaction version)
		};

		// Final validation before PaymasterRpc execution
		logger.info('Final pre-execution validation', {
			accountAddress,
			chainId: typedData.domain?.chainId,
			callCount: typedData.message?.Calls?.length || 0,
			signatureType: typeof finalSignature,
			signatureLength: Array.isArray(finalSignature) ? finalSignature.length : 'not array',
			// Include OutsideExecution nonce if present for traceability
			outsideExecutionNonce: typedData?.message?.Nonce
		});

		// Validate final signature doesn't contain oversized values
		if (Array.isArray(finalSignature)) {
			const maxFelt = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');
			const problematicValues = finalSignature.filter((val, index) => {
				if (typeof val === 'string' && val.length > 30 && /^\d+$/.test(val)) {
					try {
						const bigIntVal = BigInt(val);
						return bigIntVal > maxFelt;
					} catch {
						return false;
					}
				}
				return false;
			});

			if (problematicValues.length > 0) {
				logger.error(
					'Final signature contains oversized values that will cause Felt errors',
					new Error('Oversized signature values'),
					{
						problematicCount: problematicValues.length,
						sampleValues: problematicValues.slice(0, 3)
					}
				);
				return json(
					{
						error: 'Signature contains oversized values',
						details: `${problematicValues.length} signature elements exceed Felt252 limit`
					},
					{ status: 400 }
				);
			}
		}

		// Enhanced debugging for signature structure before PaymasterRpc execution
		console.log('🔍 DEBUG: About to call PaymasterRpc.executeTransaction:', {
			hasPayload: !!executeTransactionPayload,
			hasParameters: !!executeParameters,
			paymasterRpcReady: !!paymasterRpc,
			validationsPassed: true,
			finalSignatureType: typeof finalSignature,
			finalSignatureLength: Array.isArray(finalSignature) ? finalSignature.length : 'N/A',
			finalSignatureFirstFew: Array.isArray(finalSignature)
				? finalSignature.slice(0, 3)
				: 'not array',
			// Include signature structure for debugging
			signatureStructure: {
				isArray: Array.isArray(finalSignature),
				length: Array.isArray(finalSignature) ? finalSignature.length : 'N/A',
				firstElement:
					Array.isArray(finalSignature) && finalSignature.length > 0
						? typeof finalSignature[0]
						: 'N/A'
			}
		});

		try {
			// Execute the signed transaction using PaymasterRpc.executeTransaction
			// This is the clean approach from the Starknet.js documentation
			// The correct ExecutableUserTransaction structure requires signature inside invoke object
			const executeResponse = await paymasterRpc.executeTransaction(
				executeTransactionPayload,
				executeParameters
			);

			console.log('🔍 DEBUG: PaymasterRpc.executeTransaction succeeded:', {
				response: executeResponse,
				transactionHash: executeResponse?.transaction_hash
			});

			logger.info('Paymaster transaction executed successfully', {
				accountAddress,
				callCount: calls.length,
				transactionHash: executeResponse.transaction_hash
			});

			// Trigger immediate blockchain scanning to detect this transaction
			triggerScanAfterPayment(executeResponse.transaction_hash, accountAddress, {
				paymentType: 'paymaster',
				callCount: calls.length,
				executedAt: new Date().toISOString()
			}).catch((error) => {
				logger.warn('Failed to trigger blockchain scan after payment transaction', {
					transactionHash: executeResponse.transaction_hash,
					error: error.message
				});
			});

			return json({
				transactionHash: executeResponse.transaction_hash,
				status: 'success',
				accountAddress,
				callCount: calls.length
			});
		} catch (error) {
			// Enhanced error logging for paymaster execution
			// Safely extract error information to avoid circular references and malformed JSON
			const safeErrorInfo = {
				errorMessage: error instanceof Error ? error.message : String(error),
				errorName: error instanceof Error ? error.name : typeof error,
				errorStack: error instanceof Error ? error.stack : undefined
			};

			// Safely stringify typedData for logging (avoid circular references)
			let typedDataSummary: any = {
				hasTypedData: !!typedData,
				hasDomain: !!typedData?.domain,
				hasMessage: !!typedData?.message,
				primaryType: typedData?.primaryType,
				domainName: typedData?.domain?.name,
				domainChainId: typedData?.domain?.chainId,
				messageKeys: typedData?.message ? Object.keys(typedData.message) : 'N/A',
				callCount: typedData?.message?.Calls?.length || 0
			};

			// Try to safely stringify typedData if possible, but catch any errors
			try {
				typedDataSummary.typedDataStringified = JsonUtils.safeJsonStringify(typedData);
			} catch (stringifyError) {
				typedDataSummary.stringifyError = 'Failed to stringify typedData (likely circular reference)';
			}

			console.error('🔍 DEBUG: PaymasterRpc.executeTransaction failed with detailed error:', {
				...safeErrorInfo,
				accountAddress,
				callCount: calls.length,
				signatureAnalysis: {
					type: typeof signature,
					isArray: Array.isArray(signature),
					length: Array.isArray(signature) ? signature.length : 'N/A',
					firstSigElement: Array.isArray(signature) && signature.length > 0 ? signature[0] : 'N/A',
					secondSigElement: Array.isArray(signature) && signature.length > 1 ? signature[1] : 'N/A'
				},
				typedDataAnalysis: typedDataSummary
			});

			// If Argent complains about signature length, retry with compact layout (without separate signers array)
			// No retry path: compact_no_legacy is the only supported layout in this setup

			// Extract error message safely, handling cases where error.message might contain malformed JSON
			let errorDetails = 'Unknown error';
			if (error instanceof Error) {
				// If the error message looks like it contains malformed JSON, try to extract a cleaner message
				let errorMsg = error.message;
				
				// Check if the error message contains what looks like malformed JSON (lots of quotes and newlines)
				// This pattern matches the error format we're seeing in the logs
				if (errorMsg && (errorMsg.includes('"type":') && errorMsg.includes("'") && errorMsg.includes('\n'))) {
					// Try to extract a cleaner error message by finding the first line that doesn't look like JSON
					const lines = errorMsg.split('\n');
					const cleanLines = lines.filter(line => {
						// Skip lines that look like malformed JSON fragments
						return !(line.trim().startsWith('"') || line.trim().startsWith("'") || 
						         line.includes('"type":') || line.includes("'type':"));
					});
					
					if (cleanLines.length > 0) {
						errorMsg = cleanLines[0].substring(0, 200);
					} else {
						// If all lines look like JSON, just take the first 100 chars
						errorMsg = errorMsg.substring(0, 100) + '... (malformed JSON in error message)';
					}
				}
				
				if (errorMsg && errorMsg.length > 500) {
					// Very long error messages might contain malformed JSON - extract first meaningful part
					const firstLine = errorMsg.split('\n')[0];
					errorDetails = firstLine.length < 200 ? firstLine : errorMsg.substring(0, 200) + '...';
				} else {
					errorDetails = errorMsg;
				}
			} else if (typeof error === 'string') {
				errorDetails = error.length > 500 ? error.substring(0, 200) + '...' : error;
			} else {
				try {
					errorDetails = JSON.stringify(error);
				} catch {
					errorDetails = String(error);
				}
			}

			logger.error('Failed to execute paymaster transaction', error as Error, {
				accountAddress,
				callCount: calls.length,
				errorMessage: errorDetails
			});

			return json(
				{
					error: 'Failed to execute paymaster transaction',
					details: errorDetails,
					debugInfo: {
						errorName: error instanceof Error ? error.name : 'Unknown',
						accountAddress,
						signatureProvided: !!signature,
						typedDataProvided: !!typedData
					}
				},
				{ status: 500 }
			);
		}
	} catch (error) {
		logger.error(
			'Unexpected error in execute-signed-paymaster-transaction endpoint',
			error as Error
		);

		return json(
			{
				error: 'Internal server error',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
