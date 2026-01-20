import { ClientRpcProxyService } from '$lib/services/client/rpc-proxy.service';
import { logger } from '$lib/utils/logger';
import type { WebauthnOwner } from '$lib/utils/webauthn';
import {
	Account,
	CallData,
	EDataAvailabilityMode,
	ETransactionVersion3,
	hash,
	stark,
	type Call,
	type ResourceBounds
} from 'starknet';
import type { UserWithCredentials } from '../auth.service';
import { AuthService } from '../auth.service';
import { WebauthnService } from '../webauthn.client.service';

/**
 * Simple transaction signer for manual WBTC transfers
 *
 * This signer focuses purely on WebAuthn signing without complex gas estimation.
 * It takes pre-calculated resource bounds and signs the transactions accordingly.
 */
export class ManualTransactionSigner {
	/**
	 * Sign calls with pre-calculated resource bounds using WebAuthn
	 * Returns signed transaction ready for server-side paymaster execution
	 */
	async signCalls(
		calls: Call[],
		resourceBounds: ResourceBounds,
		swapId: string
	): Promise<{ txHash: string; tx: any }[]> {
		try {
			logger.info('Manual transaction signing started', {
				swapId,
				callCount: calls.length,
				resourceBounds
			});

			// Get user credentials
			const authService = AuthService.getInstance();
			const user: UserWithCredentials | null = await authService.loadCurrentUser();

			if (!user || !user.webauthnCredentials) {
				throw new Error('User not authenticated or missing WebAuthn credentials');
			}

			if (!user.starknetAddress) {
				throw new Error('User missing Starknet address');
			}

			// Use RPC proxy service for secure server-side RPC access
			const rpcProxy = ClientRpcProxyService.getInstance();

			// Create WebAuthn signer using the same pattern as TransactionSigner
			const webauthnSigner = this.createWebAuthnSigner(user);
			const argentSigner = new ArgentSigner(webauthnSigner);

			// Create account without provider (we'll use RPC proxy for network calls)
			const account = new Account({
				provider: null as any, // No provider needed for signing-only operations
				address: user.starknetAddress,
				signer: argentSigner,
				cairoVersion: '1', // Cairo version as string for v8.x compatibility
				transactionVersion: ETransactionVersion3.V3
			});

			logger.info('Signing transaction with pre-calculated resource bounds', {
				swapId,
				userAddress: user.starknetAddress,
				callCount: calls.length,
				resourceBounds
			});

			// Build signed transaction without executing it
			// This creates the transaction structure that the server expects
			logger.info('Building signed transaction for server-side paymaster execution', {
				swapId,
				callCount: calls.length,
				userAddress: user.starknetAddress
			});

			// Get the current nonce via RPC proxy
			const nonce = await rpcProxy.getNonce(user.starknetAddress);

			// Build the transaction structure manually (same as account.execute would do)
			const compiledCalldata = CallData.compile(
				calls.map((call) => ({
					to: call.contractAddress,
					selector: call.entrypoint,
					calldata: call.calldata
				}))
			);

			const transactionDetails = {
				type: 'INVOKE',
				sender_address: user.starknetAddress,
				calldata: compiledCalldata,
				version: ETransactionVersion3.V3,
				nonce: nonce,
				resource_bounds: resourceBounds,
				tip: '0x0',
				paymaster_data: [],
				account_deployment_data: [],
				nonce_data_availability_mode: EDataAvailabilityMode.L1,
				fee_data_availability_mode: EDataAvailabilityMode.L1
			};

			// Use Account.signTransaction() instead of manual hash calculation
			// This handles all the complex parameter preparation internally
			// Convert string resource bounds to BigInt for v8.x compatibility
			const resourceBoundsBN = {
				l1_gas: {
					max_amount:
						typeof resourceBounds.l1_gas.max_amount === 'string'
							? BigInt(resourceBounds.l1_gas.max_amount)
							: resourceBounds.l1_gas.max_amount,
					max_price_per_unit:
						typeof resourceBounds.l1_gas.max_price_per_unit === 'string'
							? BigInt(resourceBounds.l1_gas.max_price_per_unit)
							: resourceBounds.l1_gas.max_price_per_unit
				},
				l2_gas: {
					max_amount:
						typeof resourceBounds.l2_gas.max_amount === 'string'
							? BigInt(resourceBounds.l2_gas.max_amount)
							: resourceBounds.l2_gas.max_amount,
					max_price_per_unit:
						typeof resourceBounds.l2_gas.max_price_per_unit === 'string'
							? BigInt(resourceBounds.l2_gas.max_price_per_unit)
							: resourceBounds.l2_gas.max_price_per_unit
				},
				l1_data_gas: {
					max_amount:
						typeof resourceBounds.l1_data_gas.max_amount === 'string'
							? BigInt(resourceBounds.l1_data_gas.max_amount)
							: resourceBounds.l1_data_gas.max_amount,
					max_price_per_unit:
						typeof resourceBounds.l1_data_gas.max_price_per_unit === 'string'
							? BigInt(resourceBounds.l1_data_gas.max_price_per_unit)
							: resourceBounds.l1_data_gas.max_price_per_unit
				}
			};

			const transactionOptions = {
				resourceBounds: resourceBoundsBN,
				version: ETransactionVersion3.V3,
				nonceDataAvailabilityMode: EDataAvailabilityMode.L1,
				feeDataAvailabilityMode: EDataAvailabilityMode.L1
			};

			logger.info('Using Account.signTransaction() for reliable signing', {
				swapId,
				userAddress: user.starknetAddress,
				callCount: calls.length,
				transactionOptions
			});

			// Let Account's signer handle the complex internal logic - this avoids BigInt conversion issues
			const signature = await account.signer.signTransaction(calls, transactionOptions);

			// Calculate the transaction hash that was signed (for reference/logging)
			const txHash = hash.calculateInvokeTransactionHash({
				senderAddress: user.starknetAddress,
				compiledCalldata,
				version: ETransactionVersion3.V3,
				nonce: nonce,
				resourceBounds: resourceBounds,
				nonceDataAvailabilityMode: stark.intDAM(EDataAvailabilityMode.L1),
				feeDataAvailabilityMode: stark.intDAM(EDataAvailabilityMode.L1),
				accountDeploymentData: [],
				paymasterData: [],
				tip: 0n
			});

			// Create the complete signed transaction
			const signedTx = {
				...transactionDetails,
				signature: signature,
				transaction_hash: txHash
			};

			logger.info('Manual transaction signed successfully', {
				swapId,
				signedTxHash: txHash,
				hasSignedTx: !!signedTx
			});

			// Return in format expected by server
			return [
				{
					txHash: txHash,
					tx: signedTx
				}
			];
		} catch (error) {
			logger.error('Manual transaction signing failed', error as Error, {
				swapId,
				callCount: calls.length
			});
			throw error;
		}
	}

	/**
	 * Create WebAuthn signer from user credentials (same as TransactionSigner)
	 */
	private createWebAuthnSigner(user: UserWithCredentials): WebauthnOwner {
		const webauthnService = WebauthnService.getInstance();
		const signer = webauthnService.createOwnerFromStoredCredentials(
			user.webauthnCredentials.rpId,
			user.webauthnCredentials.origin,
			user.webauthnCredentials.credentialId,
			user.webauthnCredentials.publicKey
		);

		if (!signer) {
			throw new Error('Failed to create WebAuthn signer');
		}

		return signer;
	}
}
