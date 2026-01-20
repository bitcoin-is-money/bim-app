import { db, userAddresses } from '$lib/db';
import { authMiddleware } from '$lib/middleware/auth';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		// Check if database is available
		const database = db();
		if (!database) {
			return json({ error: 'Database not configured' }, { status: 500 });
		}

		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		// Get user's addresses
		const addresses = await database
			.select({
				id: userAddresses.id,
				starknetAddress: userAddresses.starknetAddress,
				addressType: userAddresses.addressType,
				isActive: userAddresses.isActive,
				registeredAt: userAddresses.registeredAt,
				lastScannedBlock: userAddresses.lastScannedBlock
			})
			.from(userAddresses)
			.where(eq(userAddresses.userId, authResult.user?.id))
			.orderBy(userAddresses.registeredAt);

		return json({
			success: true,
			addresses
		});
	} catch (error) {
		console.error('Address list error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
