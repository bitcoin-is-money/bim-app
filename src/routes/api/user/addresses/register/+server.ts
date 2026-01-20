import { RATE_LIMITS } from '$lib/constants';
import { db, userAddresses } from '$lib/db';
import { authMiddleware } from '$lib/middleware/auth';
import { validateStarknetAddress } from '$lib/middleware/validation/starknet';
import { rateLimit } from '$lib/utils/network/rate-limit';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		// Check if database is available
		const database = db();
		if (!database) {
			return json({ error: 'Database not configured' }, { status: 500 });
		}

		// Rate limiting
		const clientIP = event.getClientAddress();
		rateLimit(`register_address:${clientIP}`, RATE_LIMITS.REGISTER_ATTEMPTS, RATE_LIMITS.WINDOW_MS);

		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const { starknetAddress, addressType = 'main' } = await event.request.json();

		// Validate input
		if (!starknetAddress) {
			return json({ error: 'Starknet address is required' }, { status: 400 });
		}

		// Validate Starknet address format
		if (!validateStarknetAddress(starknetAddress)) {
			return json({ error: 'Invalid Starknet address format' }, { status: 400 });
		}

		// Check if address is already registered for this user
		const existingAddress = await database
			.select()
			.from(userAddresses)
			.where(
				and(
					eq(userAddresses.userId, authResult.user?.id),
					eq(userAddresses.starknetAddress, starknetAddress)
				)
			)
			.limit(1);

		if (existingAddress.length > 0) {
			return json({ error: 'Address already registered for this user' }, { status: 409 });
		}

		// Register the new address
		const newAddress = await database
			.insert(userAddresses)
			.values({
				userId: authResult.user?.id,
				starknetAddress: starknetAddress,
				addressType: addressType,
				isActive: true
			})
			.returning();

		return json({
			success: true,
			address: {
				id: newAddress[0].id,
				starknetAddress: newAddress[0].starknetAddress,
				addressType: newAddress[0].addressType,
				isActive: newAddress[0].isActive,
				registeredAt: newAddress[0].registeredAt
			}
		});
	} catch (error) {
		console.error('Address registration error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
