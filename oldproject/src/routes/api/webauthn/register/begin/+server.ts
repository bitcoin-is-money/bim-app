import { PublicEnv } from '$lib/config/env';
import { TIMEOUTS } from '$lib/constants/api.constants';
import { db, users } from '$lib/db';
import { webauthnChallenges } from '$lib/db/schema';
import { sanitizeString, validateUsername } from '$lib/services/shared/validation';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import type { RequestHandler } from './$types';

const CHALLENGE_COOKIE = 'webauthn_chal_id';
const CHALLENGE_TTL_MS = 60_000; // 60 seconds

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const { username } = await request.json();
		let rpID: string;
		let rpName: string;
		try {
			rpID = PublicEnv.WEBAUTHN_RP_ID();
		} catch {
			if (process.env.NODE_ENV === 'production') {
				return json({ error: 'WEBAUTHN_RP_ID not configured' }, { status: 500 });
			}
			rpID = url.hostname; // development fallback only
		}
		try {
			rpName = PublicEnv.WEBAUTHN_RP_NAME();
		} catch {
			rpName = 'BIM3 WebAuthn Wallet';
		}

		if (!username) {
			return json({ error: 'Missing username' }, { status: 400 });
		}

		const sanitizedUsername = sanitizeString(username);
		if (!validateUsername(sanitizedUsername)) {
			return json(
				{ error: 'Username must be 3-20 characters, alphanumeric and underscores only' },
				{ status: 400 }
			);
		}

		// If the username already exists, exclude its credential to prevent duplicates
		const database = db();
		if (!database) {
			console.error('[webauthn/register/begin] Database not configured');
			return json({ error: 'Database not configured' }, { status: 500 });
		}
		const existing = await database
			.select()
			.from(users)
			.where(eq(users.username, sanitizedUsername))
			.limit(1);

		// For @simplewebauthn/server, descriptor IDs should be Base64URL strings
		const excludeCredentials: { id: string; type: 'public-key' }[] =
			existing.length > 0 && existing[0]
				? [
						{
							id: existing[0].credentialId, // already stored as Base64URL string
							type: 'public-key'
						}
					]
				: [];

		const options = await generateRegistrationOptions({
			rpName,
			rpID,
			// Provide a stable user handle; server lib will encode as needed
			userID: isoUint8Array.fromUTF8String(sanitizedUsername),
			userName: sanitizedUsername,
			attestationType: 'none',
			authenticatorSelection: {
				residentKey: 'preferred',
				userVerification: 'required'
			},
			timeout: TIMEOUTS.WEBAUTHN_CREATE,
			supportedAlgorithmIDs: [-7], // ES256 (secp256r1)
			excludeCredentials
		});

		// Persist challenge with short expiry and mark single-use
		const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
		const origin = url.origin;

		const [record] = await database
			.insert(webauthnChallenges)
			.values({
				challenge: options.challenge,
				purpose: 'registration',
				rpId: rpID,
				origin,
				expiresAt
			})
			.returning();

		// Set HttpOnly cookie with the challenge record id
		cookies.set(CHALLENGE_COOKIE, record.id, {
			httpOnly: true,
			sameSite: 'strict',
			secure: true,
			path: '/',
			maxAge: Math.floor(CHALLENGE_TTL_MS / 1000)
		});

		// Do not log sensitive values
		return json({ options });
	} catch (error) {
		console.error('[webauthn/register/begin] Error:', error);
		return json({ error: 'Failed to begin registration' }, { status: 500 });
	}
};
