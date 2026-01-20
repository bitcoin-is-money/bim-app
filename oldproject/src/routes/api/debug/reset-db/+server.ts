import { json } from '@sveltejs/kit';
import { db, users } from '$lib/db';
import { logger, createRequestContext } from '$lib/utils/logger';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ServerPrivateEnv } from '$lib/config/server';

export const POST: RequestHandler = async ({ request, locals, url, getClientAddress }) => {
	const context = createRequestContext({
		request,
		locals,
		url,
		getClientAddress
	});

	try {
		// Check if debug endpoints are enabled
		const debugEnabled = process.env.ENABLE_DEBUG_ENDPOINTS === 'true';

		// Hard-disable in production builds unless explicitly enabled
		if (!dev && process.env.NODE_ENV === 'production' && !debugEnabled) {
			logger.warn('Blocked access to reset-db in production (debug not enabled)', context);
			return json({ error: 'Not Found' }, { status: 404 });
		}

		// For non-dev environments (e.g., staging), require internal admin key and optional IP allowlist
		if (!dev && debugEnabled) {
			const providedKey = request.headers.get('x-internal-key') || '';
			const expectedKey = ServerPrivateEnv.get('ADMIN_INTERNAL_KEY') || '';
			const ip = getClientAddress();
			const allowlistRaw = ServerPrivateEnv.get('DEBUG_IP_ALLOWLIST') || '';
			const allowlist = allowlistRaw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

			// Basic IPv6 localhost normalization
			const normalizedIp = ip === '::1' ? '127.0.0.1' : ip;

			// If admin key is configured, require it
			if (expectedKey && providedKey !== expectedKey) {
				logger.security('Unauthorized debug reset attempt (invalid key)', 'high', {
					...context,
					ip: normalizedIp,
					hasProvidedKey: !!providedKey,
					hasExpectedKey: !!expectedKey
				});
				return json({ error: 'Forbidden' }, { status: 403 });
			}

			// If IP allowlist is configured, require IP to be in the list
			if (allowlist.length > 0 && !allowlist.includes(normalizedIp)) {
				logger.security('Unauthorized debug reset attempt (IP not allowed)', 'high', {
					...context,
					ip: normalizedIp,
					allowlist
				});
				return json({ error: 'Forbidden' }, { status: 403 });
			}

			// If no admin key is configured and no IP allowlist, log warning but allow access
			if (!expectedKey && allowlist.length === 0) {
				logger.warn(
					'Debug endpoint accessed without authentication (no ADMIN_INTERNAL_KEY or DEBUG_IP_ALLOWLIST configured)',
					{
						...context,
						ip: normalizedIp
					}
				);
			}
		}

		logger.info('Debug: Database reset requested', context);

		// Check if database is available
		const database = db();
		if (!database) {
			logger.error('Database not configured', undefined, context);
			return json(
				{
					error: 'Database not configured',
					success: false
				},
				{ status: 500 }
			);
		}

		// Get current user count before deletion
		const beforeCount = await database.select().from(users);
		logger.info('Users before reset', {
			...context,
			userCount: beforeCount.length
		});

		// Delete all users
		const result = await database.delete(users);

		// Get user count after deletion to confirm
		const afterCount = await database.select().from(users);

		logger.info('Database reset completed', {
			...context,
			usersDeleted: beforeCount.length,
			usersRemaining: afterCount.length,
			resetSuccessful: afterCount.length === 0
		});

		return json({
			success: true,
			message: 'Database reset completed',
			usersDeleted: beforeCount.length,
			usersRemaining: afterCount.length,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		logger.error('Database reset failed', error as Error, context);
		return json(
			{
				error: 'Failed to reset database',
				success: false,
				errorMessage: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
