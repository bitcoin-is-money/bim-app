import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Deprecated endpoint. WebAuthn registration uses:
// POST /api/webauthn/register/begin and /complete
export const POST: RequestHandler = async () => {
	return json(
		{
			error:
				'Deprecated endpoint. Use /api/webauthn/register/begin and /api/webauthn/register/complete'
		},
		{ status: 410 }
	);
};
