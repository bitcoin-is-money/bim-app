import { AVNU_SERVER_CONFIG } from '$lib/config/avnu-server.config';
import { AVNU_CONFIG } from '$lib/config/avnu.config';
import { PublicEnv } from '$lib/config/env';
import { ServerPrivateEnv } from '$lib/config/server';
import { authMiddleware } from '$lib/middleware/auth';
import { CalldataUtils } from '$lib/utils/calldata-utils';
import { JsonUtils } from '$lib/utils/json-utils';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';
import {
	Account,
	ETransactionVersion3,
	hash,
	PaymasterRpc,
	RpcProvider,
	type ExecutionParameters,
	type UserTransaction
} from 'starknet';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const { accountAddress, calls, paymentMethod } = await event.request.json();

		if (!accountAddress || !calls || !Array.isArray(calls) || calls.length === 0) {
			return json(
				{
					error: 'Missing required parameters: accountAddress, calls (must be non-empty array)'
				},
				{ status: 400 }
			);
		}

		logger.info('🚀 Starting paymaster transaction build', {
			accountAddress,
			callCount: calls.length,
			paymentMethod,
			timestamp: new Date().toISOString()
		});

		// Add detailed flow detection logging
		logger.info('🔍 DEBUGGING CLAIMING FLOW: Analyzing transaction structure', {
			totalCalls: calls?.length || 0,
			firstCallStructure: calls?.[0]
				? {
						hasTo: 'to' in calls[0],
						hasSelector: 'selector' in calls[0],
						hasCalldata: 'calldata' in calls[0],
						hasContractAddress: 'contractAddress' in calls[0],
						hasEntrypoint: 'entrypoint' in calls[0],
						toValue: calls[0].to,
						selectorValue: calls[0].selector,
						contractAddressValue: calls[0].contractAddress,
						entrypointValue: calls[0].entrypoint,
						calldataLength: Array.isArray(calls[0].calldata)
							? calls[0].calldata.length
							: 'not_array'
					}
				: 'no_first_call',
			callsDetailed: calls?.map((call, index) => ({
				index,
				keys: Object.keys(call || {}),
				to: call?.to,
				selector: call?.selector,
				contractAddress: call?.contractAddress,
				entrypoint: call?.entrypoint,
				calldataLength: Array.isArray(call?.calldata) ? call.calldata.length : 'not_array'
			}))
		});

		// Check for potential duplicate commit transaction detection
		const callsSignature = JSON.stringify(calls);
		const potentialDuplicateMarkers = {
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
			callsHash: createHash('sha256').update(callsSignature).digest('hex').substring(0, 16)
		};

		logger.info('🚨 DUPLICATE DETECTION: Transaction markers', {
			...potentialDuplicateMarkers,
			accountAddress: accountAddress.substring(0, 10) + '...',
			timestamp: new Date().toISOString()
		});

		// Validate API key first
		if (!AVNU_SERVER_CONFIG.API_KEY) {
			logger.error('❌ AVNU_API_KEY is not configured on the server');
			throw new Error('AVNU_API_KEY is not configured on the server');
		}

		logger.info('✅ API key validation passed', {
			hasApiKey: !!AVNU_SERVER_CONFIG.API_KEY,
			apiKeyLength: AVNU_SERVER_CONFIG.API_KEY?.length || 0,
			apiKeyPrefix: AVNU_SERVER_CONFIG.API_KEY?.substring(0, 8) + '...'
		});

		// Create provider
		logger.info('🔧 Creating RPC provider', {
			nodeUrl: ServerPrivateEnv.STARKNET_RPC_URL(),
			specVersion: PublicEnv.STARKNET_SPEC_VERSION()
		});

		const provider = new RpcProvider({
			nodeUrl: ServerPrivateEnv.STARKNET_RPC_URL(),
			specVersion: PublicEnv.STARKNET_SPEC_VERSION() as '0.9.0' // Use the correct literal type
		});

		logger.info('✅ RPC provider created successfully');

		// Get actual chain ID from the provider
		logger.info('🔍 Detecting chain ID from RPC provider');
		let actualChainId: string;
		try {
			const chainIdResponse = await provider.getChainId();
			const rawChainId = chainIdResponse;
			actualChainId = JsonUtils.validateAndNormalizeChainId(rawChainId);

			logger.info('✅ Chain ID detected and validated successfully', {
				rawChainId,
				normalizedChainId: actualChainId,
				chainIdType: typeof rawChainId
			});
		} catch (chainIdError) {
			logger.warn('⚠️ Failed to detect chain ID, using fallback', {
				error: chainIdError instanceof Error ? chainIdError.message : 'Unknown error',
				fallbackChainId: 'SN_MAIN'
			});
			actualChainId = JsonUtils.validateAndNormalizeChainId('SN_MAIN'); // Fallback
		}

		// Create PaymasterRpc with API key
		logger.info('🔧 Creating PaymasterRpc with API key', {
			apiBaseUrl: AVNU_CONFIG.API_BASE_URL,
			hasApiKey: !!AVNU_SERVER_CONFIG.API_KEY,
			chainId: actualChainId
		});

		const paymasterRpc = new PaymasterRpc({
			nodeUrl: AVNU_CONFIG.API_BASE_URL, // Use nodeUrl instead of rpcUrl
			headers: {
				'x-paymaster-api-key': AVNU_SERVER_CONFIG.API_KEY
			}
		});

		logger.info('✅ PaymasterRpc created successfully', {
			paymasterType: typeof paymasterRpc,
			paymasterConstructor: paymasterRpc.constructor.name,
			hasHeaders: !!paymasterRpc.headers
		});

		// Create account with explicit paymaster configuration
		logger.info('🔧 Creating account with explicit paymaster configuration', {
			accountAddress,
			providerType: typeof provider,
			hasProvider: !!provider,
			hasPaymasterRpc: !!paymasterRpc
		});

		// Enhanced debug logging for account contract compatibility
		try {
			const contractClassHash = await provider.getClassHashAt(accountAddress);
			const executeSelector = hash.getSelectorFromName('__execute__');

			logger.info('🔍 DEBUG: Account contract analysis', {
				accountAddress,
				contractClassHash,
				expectedExecuteSelector: executeSelector,
				note: 'Checking if account contract has required __execute__ entrypoint'
			});

			// Try to get contract class to verify it's a valid account
			try {
				const contractClass = await provider.getClass(contractClassHash);
				const hasExecuteEntrypoint = contractClass.abi?.some(
					(item: any) =>
						item.type === 'function' && (item.name === '__execute__' || item.name === 'execute')
				);

				logger.info('✅ Account contract class retrieved', {
					classHash: contractClassHash,
					hasAbi: !!contractClass.abi,
					abiLength: contractClass.abi?.length || 0,
					hasExecuteEntrypoint,
					note: hasExecuteEntrypoint
						? 'Contract has execute entrypoint'
						: 'WARNING: Contract missing execute entrypoint'
				});
			} catch (classError) {
				logger.warn('⚠️ Could not retrieve account contract class', {
					classHash: contractClassHash,
					error: classError instanceof Error ? classError.message : 'Unknown error',
					note: 'This may indicate an incompatible or undeployed account contract'
				});
			}
		} catch (contractError) {
			logger.warn('⚠️ Could not analyze account contract', {
				accountAddress,
				error: contractError instanceof Error ? contractError.message : 'Unknown error',
				note: 'Account may not be deployed or RPC may be unavailable'
			});
		}

		const account = new Account({
			provider,
			address: accountAddress,
			signer: '0x1', // Private key as hex string
			cairoVersion: '1', // Cairo version as string for v8.x compatibility
			transactionVersion: ETransactionVersion3.V3
		});

		// Override the paymaster property with our configured instance
		account.paymaster = paymasterRpc;

		logger.info('✅ Account created successfully with custom paymaster', {
			accountAddress,
			accountType: typeof account,
			hasAccount: !!account,
			accountConstructor: account.constructor.name,
			hasCustomPaymaster: !!account.paymaster,
			paymasterType: typeof account.paymaster
		});

		// Format calls for the paymaster
		logger.info('🔧 Formatting calls for paymaster', {
			originalCalls: calls.length,
			sampleOriginalCall: calls[0],
			originalCallKeys: calls[0] ? Object.keys(calls[0]) : []
		});

		// Ensure each call has the required fields - support both PaymasterRpc and Starknet.js Account formats
		const formattedCalls = calls.map((call, index) => {
			logger.info(`🔍 DEBUGGING: Processing call ${index}`, {
				originalCall: call,
				hasTo: 'to' in call,
				hasSelector: 'selector' in call,
				hasCalldata: 'calldata' in call,
				hasContractAddress: 'contractAddress' in call,
				hasEntrypoint: 'entrypoint' in call,
				toValue: call.to,
				selectorValue: call.selector,
				contractAddressValue: call.contractAddress,
				entrypointValue: call.entrypoint,
				isEmpty: {
					to: typeof call.to === 'string' && call.to.trim() === '',
					selector: typeof call.selector === 'string' && call.selector.trim() === '',
					contractAddress:
						typeof call.contractAddress === 'string' && call.contractAddress.trim() === '',
					entrypoint: typeof call.entrypoint === 'string' && call.entrypoint.trim() === ''
				}
			});

			// Check if the call already has the correct PaymasterRpc structure
			if (
				call.to &&
				call.selector &&
				call.calldata &&
				typeof call.to === 'string' &&
				call.to.trim() !== '' &&
				typeof call.selector === 'string' &&
				call.selector.trim() !== ''
			) {
				logger.info(`✅ Call ${index} already has correct PaymasterRpc structure`, {
					to: call.to,
					selector: call.selector,
					calldataLength: call.calldata?.length || 0
				});
				return call;
			}

			// Check if the call has Starknet.js Account structure (from Atomiq claiming)
			if (
				call.contractAddress &&
				call.entrypoint &&
				call.calldata &&
				typeof call.contractAddress === 'string' &&
				call.contractAddress.trim() !== '' &&
				typeof call.entrypoint === 'string' &&
				call.entrypoint.trim() !== ''
			) {
				logger.info(
					`✅ Call ${index} has Starknet.js Account structure, converting to PaymasterRpc format`,
					{
						contractAddress: call.contractAddress,
						entrypoint: call.entrypoint,
						calldataLength: call.calldata?.length || 0
					}
				);

				// Convert Starknet.js Account format to PaymasterRpc format
				const formattedCalldata = CalldataUtils.validateAndFormatCalldata(
					call.calldata || [],
					index
				);

				// Convert entrypoint selector to hex if needed
				let formattedSelector = call.entrypoint;
				if (typeof formattedSelector === 'string' && !formattedSelector.startsWith('0x')) {
					try {
						const hexSelector = hash.getSelectorFromName(formattedSelector);
						logger.info(
							`✅ Converted Starknet.js selector "${formattedSelector}" to hex: ${hexSelector}`
						);
						formattedSelector = hexSelector;
					} catch (error) {
						logger.warn(
							`⚠️ Failed to convert Starknet.js selector "${formattedSelector}" to hex, keeping as-is`,
							{
								selector: formattedSelector,
								error: error instanceof Error ? error.message : 'Unknown error'
							}
						);
					}
				}

				return {
					to: call.contractAddress,
					selector: formattedSelector,
					calldata: formattedCalldata
				};
			}

			// Fallback: Handle mixed or incomplete call structures
			// First validate we have the minimum required fields
			const contractAddress = call.to || call.contractAddress;
			const entrypoint = call.entrypoint || call.selector;

			if (
				!contractAddress ||
				typeof contractAddress !== 'string' ||
				contractAddress.trim() === ''
			) {
				logger.error(`❌ Call ${index} is missing contract address`, {
					call,
					hasTo: !!call.to,
					hasContractAddress: !!call.contractAddress
				});
				throw new Error(`Call ${index}: Missing contract address (to/contractAddress field)`);
			}

			if (!entrypoint || typeof entrypoint !== 'string' || entrypoint.trim() === '') {
				logger.error(`❌ Call ${index} is missing entrypoint/selector`, {
					call,
					hasEntrypoint: !!call.entrypoint,
					hasSelector: !!call.selector
				});
				throw new Error(`Call ${index}: Missing entrypoint/selector field`);
			}

			// Ensure calldata values are properly formatted for Felt compatibility
			const formattedCalldata = CalldataUtils.validateAndFormatCalldata(call.calldata || [], index);

			// Convert entrypoint selector to hex if needed
			let formattedEntrypoint = entrypoint;
			if (typeof formattedEntrypoint === 'string' && !formattedEntrypoint.startsWith('0x')) {
				try {
					// Use hash.getSelectorFromName to dynamically convert string selectors to hex
					const hexSelector = hash.getSelectorFromName(formattedEntrypoint);
					logger.info(
						`✅ Converted selector "${formattedEntrypoint}" to Starknet hex: ${hexSelector}`
					);
					formattedEntrypoint = hexSelector;
				} catch (error) {
					logger.warn(
						`⚠️ Failed to convert selector "${formattedEntrypoint}" to hex, keeping as-is`,
						{
							selector: formattedEntrypoint,
							error: error instanceof Error ? error.message : 'Unknown error'
						}
					);
					// Keep the original selector if conversion fails
				}
			}

			const formattedCall = {
				to: contractAddress,
				selector: formattedEntrypoint,
				calldata: formattedCalldata
			};

			logger.info(`🔧 Formatted call ${index} for PaymasterRpc (fallback path)`, {
				original: call,
				formatted: formattedCall,
				calldataSample: call.calldata?.slice(0, 3), // Show first 3 calldata values
				calldataTypes: call.calldata?.map((val) => typeof val), // Show types of calldata values
				calldataLength: call.calldata?.length || 0
			});

			return formattedCall;
		});

		logger.info('✅ Calls formatted successfully', {
			formattedCalls: formattedCalls.length,
			sampleFormattedCall: formattedCalls[0],
			allCallsHaveTo: formattedCalls.every((call) => call.to),
			allCallsHaveSelector: formattedCalls.every((call) => call.selector),
			allCallsHaveCalldata: formattedCalls.every((call) => call.calldata)
		});

		// Use the formatted calls for non-SNIP workflows (to/selector),
		// but for SNIP-29 build we must provide standard Account call shape
		const invokeCalls = formattedCalls;

		// Build SNIP-29 friendly calls: { contractAddress, entrypoint, calldata } (entrypoint must be a NAME)
		const transferSelectorHex = hash.getSelectorFromName('transfer');
		// Known selector-name mappings (computed) + hard overrides from observed hex selectors
		const selectorNameMap: Record<string, string> = (() => {
			const names = [
				'transfer',
				'approve',
				'transferFrom',
				'commit',
				'claim',
				'initialize',
				'execute_from_outside',
				'execute_from_outside_v2',
				'supports_interface'
			];
			const map: Record<string, string> = {};
			for (const n of names) {
				try {
					map[hash.getSelectorFromName(n).toLowerCase()] = n;
				} catch {}
			}
			// Hard-coded overrides from runtime logs (hex selector -> function name)
			// approve: 0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c
			map['0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c'] = 'approve';
			// commit (standard): 0x17dd2cbe677d6dda22dd4a01edec54ba307cd2b1f7d130707ba5a29cc019c1d
			map['0x17dd2cbe677d6dda22dd4a01edec54ba307cd2b1f7d130707ba5a29cc019c1d'] = 'commit';
			// claim: 0xb758361d5e84380ef1e632f89d8e76a8677dbc3f4b93a4f9d75d2a6048f312
			map['0xb758361d5e84380ef1e632f89d8e76a8677dbc3f4b93a4f9d75d2a6048f312'] = 'claim';
			// initialize: 0x79dc0da7c54b95f10aa182ad0a46400db63156920adb65eca2654c0945a463 (lightning swap escrow initialization)
			map['0x79dc0da7c54b95f10aa182ad0a46400db63156920adb65eca2654c0945a463'] = 'initialize';
			return map;
		})();

		function entrypointToName(ep: string | undefined, sel: string | undefined): string | undefined {
			// If already a non-hex string, use it as name
			if (ep && typeof ep === 'string' && !ep.startsWith('0x')) return ep;
			const hex = (ep && ep.startsWith('0x') ? ep : sel)?.toLowerCase();
			if (!hex) return undefined;
			// Direct match from known mapping
			if (selectorNameMap[hex]) return selectorNameMap[hex];
			// Heuristic for ERC20 transfer selector
			if (hex === transferSelectorHex.toLowerCase()) return 'transfer';
			return undefined;
		}

		const snipCalls = calls.map((call, index) => {
			// Already in Account shape
			if (
				typeof call.contractAddress === 'string' &&
				call.contractAddress &&
				typeof call.entrypoint === 'string' &&
				call.entrypoint
			) {
				// If entrypoint is hex, convert to a known name for SNIP-29
				let ep = call.entrypoint as string;
				if (ep.startsWith('0x')) {
					const mapped = entrypointToName(ep, undefined);
					if (!mapped) {
						logger.error(
							'❌ SNIP-29: entrypoint provided as hex with no known mapping',
							undefined,
							{ index, contractAddress: call.contractAddress, entrypointHex: ep }
						);
						throw new Error(
							'Cannot build SNIP-29 payload: hex entrypoint without known name mapping'
						);
					}
					ep = mapped;
				}
				return {
					contractAddress: call.contractAddress,
					entrypoint: ep,
					calldata: CalldataUtils.validateAndFormatCalldata(call.calldata || [], index)
				};
			}

			// Convert from PaymasterRpc shape back to Account shape when possible
			const to = (call as any).to || (call as any).contract_address;
			const selector = (call as any).selector || (call as any).entry_point_selector;
			if (typeof to === 'string' && to) {
				const epName = entrypointToName(undefined, selector);
				if (!epName) {
					logger.error('❌ Unable to derive entrypoint name from selector for SNIP-29', undefined, {
						index,
						selector,
						note: 'Provide Account-shaped call with entrypoint name or add mapping'
					});
					throw new Error('Cannot build SNIP-29 payload: unknown selector without entrypoint');
				}
				return {
					contractAddress: to,
					entrypoint: epName,
					calldata: CalldataUtils.validateAndFormatCalldata(call.calldata || [], index)
				};
			}

			logger.error('❌ SNIP-29 call conversion failed: unsupported call shape', undefined, {
				index,
				keys: Object.keys(call || {})
			});
			throw new Error('Cannot build SNIP-29 payload: unsupported call shape');
		});

		logger.info('✅ Invoke calls prepared (normalized to PaymasterRpc format)', {
			invokeCalls: invokeCalls.length,
			sampleInvokeCall: invokeCalls[0],
			hasTo: invokeCalls[0]?.to,
			hasSelector: invokeCalls[0]?.selector,
			hasCalldata: invokeCalls[0]?.calldata
		});

		// Validate that all calls have required fields in PaymasterRpc format
		const invalidCalls = invokeCalls.filter((call, index) => {
			const isValid = call.to && call.selector && Array.isArray(call.calldata);
			if (!isValid) {
				logger.error(`❌ Call ${index} is missing required fields`, undefined, {
					callData: call,
					hasTo: !!call.to,
					hasSelector: !!call.selector,
					hasCalldata: Array.isArray(call.calldata)
				});
			}
			return !isValid;
		});

		if (invalidCalls.length > 0) {
			logger.error('❌ Some calls are missing required fields', undefined, {
				totalCalls: invokeCalls.length,
				invalidCalls: invalidCalls.length,
				invalidCallIndices: invalidCalls.map((_, index) => index)
			});
			const errorMessage = `Invalid call structure: ${invalidCalls.length} calls are missing required fields (to, selector, or calldata)`;
			throw new Error(errorMessage);
		}

		logger.info('✅ All calls validated successfully', {
			totalCalls: invokeCalls.length,
			allCallsValid: true
		});

		// Try SNIP-29 PaymasterRpc.buildTransaction first, fallback to direct generation
		logger.info('🚀 Attempting SNIP-29 PaymasterRpc.buildTransaction', {
			method: 'SNIP-29 buildTransaction',
			parameters: {
				type: 'invoke',
				accountAddress,
				callCount: invokeCalls.length
			},
			timestamp: new Date().toISOString()
		});

		// Declare variables outside try block so they're accessible in catch block
		let sanitizedPayload: UserTransaction | null = null;
		let buildParameters: ExecutionParameters | null = null;

		try {
			// SNIP-29 Approach: Try PaymasterRpc.buildTransaction first
			logger.info('🔧 Attempting SNIP-29 PaymasterRpc.buildTransaction method');

			// Calculate timestamps and nonce for outside execution
			const now = Date.now();
			const executeAfter = Math.floor((now - 60000) / 1000); // 1 minute ago
			const executeBefore = Math.floor((now + 3600000) / 1000); // 1 hour from now
			const nonceHex = `0x${randomBytes(16).toString('hex')}`;

			const buildTransactionPayload = {
				type: 'invoke' as const,
				invoke: {
					userAddress: accountAddress, // starknet.js expects camelCase, converts internally
					calls: snipCalls // Use snipCalls directly - they already have contractAddress/entrypoint format
				}
			};

			buildParameters = {
				feeMode: { mode: 'sponsored' as const },
				version: '0x1' as const // PaymasterRpc API version (separate from transaction version)
			};

			logger.info('🔧 Pre-sanitization payload structure', {
				payloadType: buildTransactionPayload.type,
				userAddress: buildTransactionPayload.invoke.userAddress,
				callCount: buildTransactionPayload.invoke.calls.length,
				firstCallSample: buildTransactionPayload.invoke.calls[0],
				calldataTypes: buildTransactionPayload.invoke.calls[0]?.calldata?.map((val) => typeof val),
				note: 'Using starknet.js PaymasterRpc expected format: userAddress (camelCase) + contractAddress/entrypoint calls'
			});

			// Sanitize the payload to remove BigInt values that cause serialization errors
			sanitizedPayload = JsonUtils.sanitizeBigIntToHex(buildTransactionPayload) as UserTransaction;

			logger.info('🧹 Payload sanitized for PaymasterRpc compatibility', {
				originalPayloadKeys: Object.keys(buildTransactionPayload),
				sanitizedPayloadKeys: Object.keys(sanitizedPayload),
				firstCallAfterSanitization: 'invoke' in sanitizedPayload ? sanitizedPayload.invoke?.calls?.[0] : undefined,
				firstCallAfterSanitizationKeys: 'invoke' in sanitizedPayload ? Object.keys(sanitizedPayload.invoke?.calls?.[0] || {}) : [],
				calldataTypesAfterSanitization: 'invoke' in sanitizedPayload ? (sanitizedPayload.invoke?.calls?.[0] as any)?.calldata?.map(
					(val: any) => typeof val
				) : [],
				transactionType: sanitizedPayload.type,
				note: 'starknet.js PaymasterRpc format after sanitization - library will convert internally'
			});

			// Validate that the sanitized payload can be JSON serialized
			JsonUtils.validatePayloadSerialization(sanitizedPayload, 'SNIP-29 buildTransaction');
			JsonUtils.validatePayloadSerialization(buildParameters, 'SNIP-29 buildParameters');

			// Critical validation: Check that all calls have required fields after sanitization
			const missingFieldErrors: string[] = [];
			if ('invoke' in sanitizedPayload) {
				sanitizedPayload.invoke?.calls?.forEach((call: any, index: number) => {
					if (!call.contractAddress)
						missingFieldErrors.push(`Call ${index}: missing 'contractAddress' field`);
					if (!call.entrypoint) missingFieldErrors.push(`Call ${index}: missing 'entrypoint' field`);
					if (!Array.isArray(call.calldata))
						missingFieldErrors.push(`Call ${index}: missing or invalid 'calldata' field`);
				});
			}

			if (missingFieldErrors.length > 0) {
				logger.error('❌ Critical: Sanitized payload missing required fields', undefined, {
					errors: missingFieldErrors,
					sanitizedPayload: JSON.stringify(sanitizedPayload, null, 2),
					originalPayload: JSON.stringify(buildTransactionPayload, null, 2),
					note: 'This indicates a bug in the sanitization process or conversion logic'
				});
				throw new Error(
					`Sanitized payload missing required fields: ${missingFieldErrors.join(', ')}`
				);
			}

			logger.info('✅ Post-sanitization validation passed - all calls have required fields');

			logger.info('🔧 Calling PaymasterRpc.buildTransaction with sanitized SNIP-29 payload', {
				payloadType: sanitizedPayload.type,
				userAddress: 'invoke' in sanitizedPayload ? sanitizedPayload.invoke?.userAddress : undefined,
				callCount: 'invoke' in sanitizedPayload ? sanitizedPayload.invoke?.calls?.length : 0,
				firstCall: 'invoke' in sanitizedPayload ? sanitizedPayload.invoke?.calls?.[0] : undefined,
				secondCall: 'invoke' in sanitizedPayload ? sanitizedPayload.invoke?.calls?.[1] : undefined,
				allCallsStructure: 'invoke' in sanitizedPayload ? sanitizedPayload.invoke?.calls?.map((call: any, i: number) => ({
					index: i,
					hasContractAddress: !!call.contractAddress,
					hasEntrypoint: !!call.entrypoint,
					hasCalldata: Array.isArray(call.calldata),
					contractAddressValue: call.contractAddress,
					entrypointValue: call.entrypoint,
					calldataLength: call.calldata?.length
				})) : [],
				feeMode: buildParameters.feeMode.mode,
				version: buildParameters.version,
				note: 'Final payload using starknet.js expected format - library will convert userAddress->user_address and calls->RPC format internally'
			});

			const buildResponse = await paymasterRpc.buildTransaction(sanitizedPayload, buildParameters);

			logger.info('✅ SNIP-29 PaymasterRpc.buildTransaction succeeded', {
				responseType: typeof buildResponse,
				responseKeys: buildResponse ? Object.keys(buildResponse) : [],
				hasTypedData: !!(buildResponse as any)?.typedData || !!(buildResponse as any)?.typed_data,
				hasTransaction: !!(buildResponse as any)?.transaction,
				hasFee: !!(buildResponse as any)?.fee
			});

			// Sanitize the response to handle BigInt values before JSON serialization
			const sanitizedBuildResponse = JsonUtils.sanitizeBigIntToHex(buildResponse);

			logger.info('🧹 PaymasterRpc response sanitized for JSON serialization', {
				originalResponseKeys: Object.keys(buildResponse),
				sanitizedResponseKeys: Object.keys(sanitizedBuildResponse),
				hasTypedDataAfterSanitization:
					!!sanitizedBuildResponse?.typedData || !!sanitizedBuildResponse?.typed_data,
				hasFeeAfterSanitization: !!sanitizedBuildResponse?.fee
			});

			// Get the typed data from PaymasterRpc response
			let typedData = sanitizedBuildResponse.typedData || sanitizedBuildResponse.typed_data;

			// Validate that we got typed data
			if (!typedData) {
				throw new Error('SNIP-29 PaymasterRpc.buildTransaction did not return typedData');
			}

			// Log the corrected typedData structure for verification (include nonce for traceability)
			logger.info('🔍 SNIP-29 typedData validation', {
				hasMessage: !!typedData.message,
				hasCaller: !!typedData.message?.Caller,
				callerAddress: typedData.message?.Caller,
				accountAddress: accountAddress,
				callerMatches:
					typedData.message?.Caller === accountAddress ||
					typedData.message?.Caller === 'ANY_CALLER' ||
					typedData.message?.Caller === '0x414e595f43414c4c4552',
				hasNonce: !!typedData.message?.Nonce,
				nonceValue: typedData.message?.Nonce,
				primaryType: typedData.primaryType
			});

			// Convert sanitized response to our expected format
			const responseData = {
				typedData: typedData,
				transaction: sanitizedBuildResponse.transaction,
				fee: sanitizedBuildResponse.fee,
				calls: invokeCalls,
				accountAddress,
				paymentMethod,
				approach: 'SNIP-29 PaymasterRpc.buildTransaction'
			};

			// Validate that the response can be JSON serialized
			JsonUtils.validatePayloadSerialization(responseData, 'SNIP-29 response');

			logger.info('✅ SNIP-29 approach successful, returning response');
			return json(responseData);
		} catch (snip29Error) {
			// Enhanced error logging for SNIP-29 failures
			const errorDetails = {
				error: snip29Error instanceof Error ? snip29Error.message : 'Unknown error',
				errorType: typeof snip29Error,
				errorName: snip29Error instanceof Error ? snip29Error.name : 'Unknown',
				errorStack: snip29Error instanceof Error ? snip29Error.stack : undefined,
				payloadStructure: sanitizedPayload
					? {
							type: sanitizedPayload.type,
							hasInvoke:
								sanitizedPayload.type === 'invoke' || sanitizedPayload.type === 'deploy_and_invoke',
							userAddress:
								sanitizedPayload.type === 'invoke' || sanitizedPayload.type === 'deploy_and_invoke'
									? sanitizedPayload.invoke.userAddress
									: 'N/A',
							callCount:
								sanitizedPayload.type === 'invoke'
									? sanitizedPayload.invoke.calls.length
									: sanitizedPayload.type === 'deploy_and_invoke'
										? sanitizedPayload.invoke.calls.length
										: 0,
							firstCallStructure:
								sanitizedPayload.type === 'invoke' || sanitizedPayload.type === 'deploy_and_invoke'
									? sanitizedPayload.invoke.calls[0]
										? Object.keys(sanitizedPayload.invoke.calls[0])
										: []
									: []
						}
					: {
							note: 'sanitizedPayload was not created (error occurred before sanitization)'
						},
				buildParametersStructure: buildParameters
					? {
							hasFeeMode: !!buildParameters.feeMode,
							feeMode: buildParameters.feeMode?.mode,
							version: buildParameters.version
						}
					: {
							note: 'buildParameters was not created (error occurred before parameter setup)'
						}
			};

			logger.warn('⚠️ SNIP-29 PaymasterRpc.buildTransaction failed', errorDetails);

			// Per policy: no fallback, error out here
			return json(
				{
					error: 'Paymaster build failed (SNIP-29)',
					details: errorDetails.error,
					debugInfo: errorDetails
				},
				{ status: 500 }
			);
		} // End of SNIP-29 catch block fallback
	} catch (error) {
		logger.error('💥 Unexpected error in build-paymaster-transaction endpoint', error as Error, {
			errorType: typeof error,
			errorConstructor: error?.constructor?.name || 'Unknown',
			timestamp: new Date().toISOString()
		});

		return json(
			{
				error: 'Internal server error',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
