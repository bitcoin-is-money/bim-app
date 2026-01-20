import { authMiddleware } from '$lib/middleware/auth';
import { serverStarknetService } from '$lib/services/server';
import { userAddressService } from '$lib/services/server/user-address.service';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const { classHash, signer } = await event.request.json();

		if (!classHash || !signer) {
			return json(
				{
					error: 'Missing required parameters: classHash, signer'
				},
				{ status: 400 }
			);
		}
		// Use server-side Starknet service to deploy account
		const result = await serverStarknetService.deployAccountWithPaymaster(classHash, signer);

		// Auto-register the deployed address for the user
		if (result.accountAddress) {
			const registrationResult = await userAddressService.autoRegisterDeployedAddress(
				authResult.user?.id,
				result.accountAddress
			);

			if (!registrationResult.success) {
				console.warn('Failed to auto-register deployed address:', registrationResult.error);
				// Don't fail the deployment if address registration fails
			}
		}

		return json(result);
	} catch (error) {
		console.error('Error deploying account:', error);

		// Provide more specific error messages
		let errorMessage = 'Deployment failed';
		if (error instanceof Error) {
			if (error.message.includes('insufficient balance')) {
				errorMessage = 'Insufficient balance for deployment';
			} else if (error.message.includes('paymaster')) {
				errorMessage = 'Paymaster service unavailable. Please try self-pay deployment.';
			} else if (error.message.includes('network')) {
				errorMessage = 'Network error. Please check your connection and try again.';
			} else {
				errorMessage = `Deployment failed: ${error.message}`;
			}
		}

		return json(
			{
				error: errorMessage,
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
