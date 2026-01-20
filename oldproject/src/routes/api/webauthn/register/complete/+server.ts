import { json } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { PublicEnv } from '$lib/config/env';
import { db, users } from '$lib/db';
import { and, eq } from 'drizzle-orm';
import { sanitizeString, validateUsername } from '$lib/services/shared/validation';
import { webauthnChallenges } from '$lib/db/schema';
import cbor from 'cbor';
import { createSession, setSessionCookie } from '$lib/auth/session';

import type { RequestHandler } from './$types';

const CHALLENGE_COOKIE = 'webauthn_chal_id';

function base64urlToBuffer(b64url: string): Buffer {
	return Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function coseToRawP256PublicKey(cosePublicKey: ArrayBuffer): Uint8Array {
	const decoded = cbor.decodeFirstSync(Buffer.from(cosePublicKey));
	// COSE EC2 key: -2 => x, -3 => y
	const x: Buffer = decoded.get(-2);
	const y: Buffer = decoded.get(-3);
	if (!x || !y) throw new Error('Invalid COSE EC2 key');
	const raw = new Uint8Array(65);
	raw[0] = 0x04;
	raw.set(new Uint8Array(x), 1);
	raw.set(new Uint8Array(y), 33);
	return raw;
}

function toNodeBuffer(data: unknown): Buffer {
	if (!data) throw new Error('Missing buffer data');
	if (Buffer.isBuffer(data)) return data;
	if (data instanceof Uint8Array) return Buffer.from(data);
	if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
	// Some runtimes return DataView
	if (data instanceof DataView) return Buffer.from(new Uint8Array(data.buffer));
	// Last resort: try to construct from typed array-like
	// @ts-ignore
	if (data.buffer && data.byteLength !== undefined) return Buffer.from(new Uint8Array(data));
	throw new Error('Unsupported buffer-like type');
}

function parseAttestationForKeys(attestationObjectB64url: string): {
	credentialID: Buffer;
	credentialPublicKey: Buffer;
	signCount: number;
} {
	const attObjBuf = base64urlToBuffer(attestationObjectB64url);
	const attObj = cbor.decodeFirstSync(attObjBuf) as Map<string, any> | Record<string, any>;
	const authData: Buffer = (attObj as any).authData || (attObj as any).get?.('authData');
	if (!authData) throw new Error('authData missing in attestationObject');
	let ptr = 0;
	// rpIdHash (32)
	ptr += 32;
	// flags (1)
	const flags = authData[ptr];
	ptr += 1;
	// signCount (4)
	const signCount = authData.readUInt32BE(ptr);
	ptr += 4;
	const AT_FLAG = 0x40;
	if ((flags & AT_FLAG) === 0) {
		throw new Error('Attested credential data flag not set');
	}
	// aaguid (16)
	ptr += 16;
	// credential ID length (2)
	const credIdLen = authData.readUInt16BE(ptr);
	ptr += 2;
	// credential ID (credIdLen)
	const credentialID = authData.slice(ptr, ptr + credIdLen);
	ptr += credIdLen;
	// COSE public key (CBOR). Extract by decoding from ptr then re-encoding for stable bytes
	const coseKey = cbor.decodeFirstSync(authData.slice(ptr));
	const credentialPublicKey = cbor.encode(coseKey);
	return { credentialID, credentialPublicKey, signCount };
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const { username, attestation } = await request.json();

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

		if (!username || !attestation) {
			return json({ error: 'Missing username or attestation' }, { status: 400 });
		}

		const sanitizedUsername = sanitizeString(username);
		if (!validateUsername(sanitizedUsername)) {
			return json(
				{ error: 'Username must be 3-20 characters, alphanumeric and underscores only' },
				{ status: 400 }
			);
		}

		const database = db();
		if (!database) {
			console.error('[webauthn/register/complete] Database not configured');
			return json({ error: 'Database not configured' }, { status: 500 });
		}

		// Fetch and validate challenge
		const challengeId = cookies.get(CHALLENGE_COOKIE);
		if (!challengeId) return json({ error: 'Challenge not found' }, { status: 400 });

		const [record] = await database
			.select()
			.from(webauthnChallenges)
			.where(
				and(eq(webauthnChallenges.id, challengeId), eq(webauthnChallenges.purpose, 'registration'))
			)
			.limit(1);

		if (!record || record.used || record.expiresAt < new Date()) {
			return json({ error: 'Challenge expired or already used' }, { status: 400 });
		}

		// Verify registration response
		const verification = await verifyRegistrationResponse({
			response: attestation,
			expectedChallenge: record.challenge,
			expectedRPID: rpID,
			expectedOrigin,
			requireUserVerification: true
		});

		if (!verification.verified || !verification.registrationInfo) {
			return json({ error: 'Attestation verification failed' }, { status: 401 });
		}

		let { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

		if (!credentialID || !credentialPublicKey) {
			// Fallback: parse from attestationObject
			try {
				const {
					credentialID: parsedID,
					credentialPublicKey: parsedKey,
					signCount
				} = parseAttestationForKeys(attestation?.response?.attestationObject);
				// Assign parsed values
				credentialID = parsedID as any;
				credentialPublicKey = parsedKey as any;
				if (typeof counter !== 'number') counter = signCount;
			} catch (parseErr) {
				console.error(
					'[webauthn/register/complete] Missing credential fields and parse failed',
					parseErr
				);
				return json({ error: 'Registration info incomplete' }, { status: 500 });
			}
		}

		// Prevent duplicate usernames or credentials
		const existingUserByName = await database
			.select()
			.from(users)
			.where(eq(users.username, sanitizedUsername))
			.limit(1);
		if (existingUserByName.length) {
			return json({ error: 'Username already exists' }, { status: 409 });
		}

		const existingUserByCred = await database
			.select()
			.from(users)
			.where(eq(users.credentialId, credentialID.toString('base64url')))
			.limit(1);
		if (existingUserByCred.length) {
			return json({ error: 'Credential already registered' }, { status: 409 });
		}

		// Convert public keys to required formats
		const credentialPublicKeyBuf = toNodeBuffer(credentialPublicKey);
		const credentialPublicKeyB64Url = credentialPublicKeyBuf.toString('base64url');
		const rawUncompressed = coseToRawP256PublicKey(credentialPublicKeyBuf);
		const rawUncompressedB64 = Buffer.from(rawUncompressed).toString('base64');

		// Create user
		const [newUser] = await database
			.insert(users)
			.values({
				username: sanitizedUsername,
				credentialId: toNodeBuffer(credentialID).toString('base64url'),
				credentialPublicKey: credentialPublicKeyB64Url,
				signCount: counter,
				rpId: rpID,
				publicKey: rawUncompressedB64
			})
			.returning();

		// Invalidate challenge
		await database
			.update(webauthnChallenges)
			.set({ used: true })
			.where(eq(webauthnChallenges.id, record.id));

		// Clear cookie
		cookies.delete(CHALLENGE_COOKIE, { path: '/' });

		// Create session and set cookie to mirror previous behavior
		const sessionId = await createSession(newUser.id);
		setSessionCookie({ cookies } as any, sessionId);

		// Return minimal safe user info
		return json({ success: true, user: newUser });
	} catch (error) {
		console.error('[webauthn/register/complete] Error:', error);
		return json({ error: 'Failed to complete registration' }, { status: 500 });
	}
};
