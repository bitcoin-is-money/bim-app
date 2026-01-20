import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.user) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		return json({
			user: {
				id: locals.user.id,
				username: locals.user.username,
				credentialId: locals.user.credentialId,
				publicKey: locals.user.publicKey,
				createdAt: locals.user.createdAt
			}
		});
	} catch (error) {
		console.error('User profile error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
