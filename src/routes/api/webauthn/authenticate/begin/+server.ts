import { PublicEnv } from '$lib/config/env';
import { TIMEOUTS } from '$lib/constants/api.constants';
import { db, users } from '$lib/db';
import { webauthnChallenges } from '$lib/db/schema';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import type { RequestHandler } from './$types';

const CHALLENGE_COOKIE = 'webauthn_chal_id';
const CHALLENGE_TTL_MS = 60_000; // 60 seconds

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const { username } = await request.json().catch(() => ({ username: undefined }));
		let rpID: string;
		try {
			rpID = PublicEnv.WEBAUTHN_RP_ID();
		} catch {
			if (process.env.NODE_ENV === 'production') {
				return json({ error: 'WEBAUTHN_RP_ID not configured' }, { status: 500 });
			}
			rpID = url.hostname; // development fallback only
		}

		const database = db();
		if (!database) {
			console.error('[webauthn/authenticate/begin] Database not configured');
			return json({ error: 'Database not configured' }, { status: 500 });
		}

		let allowCredentials: { id: string; type: 'public-key' }[] | undefined = undefined;

		if (username) {
			console.log('[webauthn/authenticate/begin] provided username:', username);
			const [user] = await database
				.select()
				.from(users)
				.where(eq(users.username, username))
				.limit(1);
			if (user) {
				console.log('[webauthn/authenticate/begin] associated user:', user);
				// @simplewebauthn/server expects Base64URL strings for descriptor IDs
				allowCredentials = [{ id: user.credentialId, type: 'public-key' }];
			}
		}

		console.log('[webauthn/authenticate/begin] allowCredentials:', allowCredentials);

		const options = await generateAuthenticationOptions({
			rpID,
			timeout: TIMEOUTS.WEBAUTHN_GET,
			userVerification: 'required',
			allowCredentials
		});

		// Persist challenge
		const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
		const origin = url.origin;

		const [record] = await database
			.insert(webauthnChallenges)
			.values({
				challenge: options.challenge,
				purpose: 'authentication',
				rpId: rpID,
				origin,
				expiresAt
			})
			.returning();

		cookies.set(CHALLENGE_COOKIE, record.id, {
			httpOnly: true,
			sameSite: 'strict',
			secure: true,
			path: '/',
			maxAge: Math.floor(CHALLENGE_TTL_MS / 1000)
		});

		return json({ options });
	} catch (error) {
		console.error('[webauthn/authenticate/begin] Error:', error);
		return json({ error: 'Failed to begin authentication' }, { status: 500 });
	}
};
