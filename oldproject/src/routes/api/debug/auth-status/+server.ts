import { json } from '@sveltejs/kit';
import { db, users } from '$lib/db';
import { logger, createRequestContext } from '$lib/utils/logger';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

export const GET: RequestHandler = async ({ request, locals, url, getClientAddress }) => {
	const context = createRequestContext({
		request,
		locals,
		url,
		getClientAddress
	});

	try {
		// Hard-disable in production builds
		if (!dev && process.env.NODE_ENV === 'production') {
			logger.warn('Blocked access to debug auth-status in production', context);
			return json({ error: 'Not Found' }, { status: 404 });
		}

		logger.info('Debug: checking auth system status', context);

		// Check if database is available
		const database = db();
		if (!database) {
			logger.error('Database not configured', undefined, context);
			return json(
				{
					error: 'Database not configured',
					dbAvailable: false
				},
				{ status: 500 }
			);
		}

		// Get count of users
		const userCount = await database.select().from(users);

		logger.info('Debug: database check completed', {
			...context,
			userCount: userCount.length,
			dbAvailable: true
		});

		// Return sanitized user info (no sensitive data)
		const sanitizedUsers = userCount.map((user) => ({
			id: user.id,
			username: user.username,
			credentialIdPreview: user.credentialId.slice(0, 8) + '...',
			credentialIdLength: user.credentialId.length,
			publicKeyPreview: user.publicKey.slice(0, 8) + '...',
			publicKeyLength: user.publicKey.length,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt
		}));

		return json({
			dbAvailable: true,
			userCount: userCount.length,
			users: sanitizedUsers,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		logger.error('Debug endpoint failed', error as Error, context);
		return json(
			{
				error: 'Failed to check auth status',
				dbAvailable: false,
				errorMessage: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
