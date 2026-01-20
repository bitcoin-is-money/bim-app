import { AVNU_SERVER_CONFIG } from '$lib/config/avnu-server.config';
import { AVNU_CONFIG } from '$lib/config/avnu.config';
import { PublicEnv } from '$lib/config/env';
import { authMiddleware } from '$lib/middleware/auth';
import { logger } from '$lib/utils/logger';
import { DummySigner } from '$lib/utils/starknet/signer-types';
import { triggerScanAfterPayment } from '$lib/utils/transaction-completion';
import { json } from '@sveltejs/kit';
import {
	Account,
	ETransactionVersion3,
	PaymasterRpc,
	RpcProvider,
	type PaymasterDetails
} from 'starknet';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const { swapId, calls, userAddress, providerUrl } = await event.request.json();

		if (!swapId || !calls || !userAddress || !providerUrl) {
			return json(
				{
					error: 'Missing required parameters: swapId, calls, userAddress, providerUrl'
				},
				{ status: 400 }
			);
		}

		logger.info('Server-side paymaster transaction execution', {
			swapId,
			userAddress,
			callCount: calls.length
		});

		// Create provider with configured RPC spec version
		const provider = new RpcProvider({
			nodeUrl: providerUrl,
			specVersion: PublicEnv.STARKNET_SPEC_VERSION()
		});

		// Create PaymasterRpc with API key (server-side only)
		const paymaster = new PaymasterRpc({
			nodeUrl: AVNU_CONFIG.API_BASE_URL,
			headers: { 'x-paymaster-api-key': AVNU_SERVER_CONFIG.API_KEY }
		});

		// Create WebAuthn signer from authenticated user DB record (not client input)
		const user = (event.locals as any).user;
		if (!user) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		if (!user.publicKey || !user.rpId) {
			return json({ error: 'Missing stored WebAuthn credentials for user' }, { status: 400 });
		}

		// Use dummy signer for server-side paymaster transactions
		const signer = new DummySigner();

		// Create account configured for paymaster-only transactions (zero balance friendly)
		const account = new Account({
			provider,
			address: userAddress,
			signer,
			cairoVersion: '1', // Cairo version as string for v8.x compatibility
			transactionVersion: ETransactionVersion3.V3,
			paymaster
		});

		logger.info('Executing paymaster transaction with calls:', calls);

		// Use sponsored mode (dApp pays gas fees)
		const feesDetails: PaymasterDetails = {
			feeMode: { mode: 'sponsored' }
		};

		logger.info('Using pure paymaster fee estimation (no user balance required):', {
			swapId,
			paymaster: 'AVNU',
			mode: 'sponsored',
			userBalance: 'not_required'
		});

		// Execute with paymaster using dynamic gas pricing
		const result = await account.executePaymasterTransaction(calls, feesDetails);

		logger.info('Paymaster transaction completed successfully!', {
			txHash: result.transaction_hash,
			swapId
		});

		// Trigger immediate blockchain scanning to detect this transaction
		triggerScanAfterPayment(result.transaction_hash, userAddress, {
			paymentType: 'direct_paymaster',
			swapId,
			executedAt: new Date().toISOString()
		}).catch((error) => {
			logger.warn('Failed to trigger blockchain scan after paymaster transaction', {
				transactionHash: result.transaction_hash,
				swapId,
				error: error.message
			});
		});

		return json({
			success: true,
			message: 'Paymaster transaction completed successfully!',
			txHash: result.transaction_hash
		});
	} catch (error) {
		const errorMsg = `Paymaster transaction error: ${error instanceof Error ? error.message : 'Unknown error'}`;
		logger.error('Server-side paymaster transaction failed', error as Error, {
			swapId: (event.request as any).json?.swapId
		});

		return json(
			{
				success: false,
				error: errorMsg,
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
