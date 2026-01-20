import { clearSessionCookie, deleteSession, getSessionId } from '$lib/auth/session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	try {
		const sessionId = getSessionId({ cookies } as any);
		console.log('Logout: Session ID found:', !!sessionId);

		if (sessionId) {
			await deleteSession(sessionId);
			console.log('Logout: Session deleted from database');
		}

		clearSessionCookie({ cookies } as any);
		console.log('Logout: Session cookie cleared');

		return json({ success: true });
	} catch (error) {
		console.error('Logout error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
