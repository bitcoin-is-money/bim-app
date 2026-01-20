import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Deprecated endpoint. WebAuthn authentication uses:
// POST /api/webauthn/authenticate/begin and /complete
export const POST: RequestHandler = async () => {
	return json(
		{
			error:
				'Deprecated endpoint. Use /api/webauthn/authenticate/begin and /api/webauthn/authenticate/complete'
		},
		{ status: 410 }
	);
};
