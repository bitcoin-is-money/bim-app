import { json } from '@sveltejs/kit';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { PublicEnv } from '$lib/config/env';
import { db, users } from '$lib/db';
import { and, eq } from 'drizzle-orm';
import { webauthnChallenges } from '$lib/db/schema';
import { createSession, setSessionCookie } from '$lib/auth/session';

import type { RequestHandler } from './$types';

const CHALLENGE_COOKIE = 'webauthn_chal_id';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const { assertion } = await request.json();

		console.log('[webauthn/authenticate/complete] DEBUG: Request received:', {
			hasAssertion: !!assertion,
			assertionId: assertion?.id,
			assertionType: typeof assertion?.id,
			assertionIdLength: assertion?.id?.length
		});

		let rpID: string;
		try {
			rpID = PublicEnv.WEBAUTHN_RP_ID();
		} catch {
			if (process.env.NODE_ENV === 'production') {
				return json({ error: 'WEBAUTHN_RP_ID not configured' }, { status: 500 });
			}
			rpID = url.hostname; // development fallback only
		}
		const expectedOrigin = url.origin;

		if (!assertion) return json({ error: 'Missing assertion' }, { status: 400 });

		const database = db();
		if (!database) {
			console.error('[webauthn/authenticate/complete] Database not configured');
			return json({ error: 'Database not configured' }, { status: 500 });
		}

		// Load and validate challenge
		const challengeId = cookies.get(CHALLENGE_COOKIE);
		if (!challengeId) return json({ error: 'Challenge not found' }, { status: 400 });

		const [record] = await database
			.select()
			.from(webauthnChallenges)
			.where(
				and(
					eq(webauthnChallenges.id, challengeId),
					eq(webauthnChallenges.purpose, 'authentication')
				)
			)
			.limit(1);

		if (!record || record.used || record.expiresAt < new Date()) {
			return json({ error: 'Challenge expired or already used' }, { status: 400 });
		}

		// Find user by credential ID
		// Note: assertion.id is base64url
		console.log(
			'[webauthn/authenticate/complete] DEBUG: Looking up user with credential ID:',
			assertion.id
		);

		const [user] = await database
			.select()
			.from(users)
			.where(eq(users.credentialId, assertion.id))
			.limit(1);

		console.log('[webauthn/authenticate/complete] DEBUG: User lookup result:', {
			userFound: !!user,
			userId: user?.id,
			username: user?.username,
			hasCredentialPublicKey: !!user?.credentialPublicKey,
			credentialPublicKeyLength: user?.credentialPublicKey?.length,
			storedCredentialId: user?.credentialId,
			credentialIdMatch: user?.credentialId === assertion.id
		});

		if (!user || !user.credentialPublicKey) {
			console.log('[webauthn/authenticate/complete] ERROR: Unknown credential');
			return json({ error: 'Unknown credential' }, { status: 401 });
		}

		const publicKeyBuffer = isoBase64URL.toBuffer(user.credentialPublicKey);
		const credentialObj = {
			id: user.credentialId,
			publicKey: publicKeyBuffer,
			counter: Number(user.signCount || 0)
		};

		console.log('[webauthn/authenticate/complete] DEBUG: Credential object for verification:', {
			credentialId: credentialObj.id,
			publicKeyType: credentialObj.publicKey.constructor.name,
			publicKeyLength: credentialObj.publicKey.length,
			counter: credentialObj.counter,
			expectedChallenge: record.challenge,
			expectedRPID: rpID,
			expectedOrigin
		});

		const verification = await verifyAuthenticationResponse({
			response: assertion,
			expectedChallenge: record.challenge,
			expectedRPID: rpID,
			expectedOrigin,
			requireUserVerification: true,
			credential: credentialObj
		});

		console.log('[webauthn/authenticate/complete] DEBUG: Verification result:', {
			verified: verification.verified,
			hasAuthenticationInfo: !!verification.authenticationInfo,
			newCounter: verification.authenticationInfo?.newCounter,
			errorDetails: verification.verified ? null : 'Verification failed'
		});

		if (!verification.verified || !verification.authenticationInfo) {
			console.log('[webauthn/authenticate/complete] ERROR: Authentication verification failed');
			return json({ error: 'Authentication verification failed' }, { status: 401 });
		}

		const { newCounter } = verification.authenticationInfo;

		// Update counter (anti-replay)
		await database.update(users).set({ signCount: newCounter }).where(eq(users.id, user.id));

		// Invalidate challenge
		await database
			.update(webauthnChallenges)
			.set({ used: true })
			.where(eq(webauthnChallenges.id, record.id));

		// Clear cookie
		cookies.delete(CHALLENGE_COOKIE, { path: '/' });

		// Create session and set cookie
		const sessionId = await createSession(user.id);
		setSessionCookie({ cookies } as any, sessionId);

		return json({ success: true, user });
	} catch (error) {
		console.error('[webauthn/authenticate/complete] Error:', error);
		return json({ error: 'Failed to complete authentication' }, { status: 500 });
	}
};
