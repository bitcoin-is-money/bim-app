#!/usr/bin/env node

/*
 * Cleanup expired/used WebAuthn challenges.
 * - Removes used challenges older than 1 day
 * - Removes expired challenges older than 15 minutes beyond expiry
 */

import postgres from 'postgres';

async function main() {
	let client;
	try {
		const dbUrl = process.env.DATABASE_URL;
		if (!dbUrl) {
			throw new Error('DATABASE_URL is not set in environment');
		}
		client = postgres(dbUrl, {
			max: 1,
			idle_timeout: 10,
			connect_timeout: 10,
			ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
		});

		console.log('🧹 Cleaning WebAuthn challenges...');
		const res = await client`
      WITH deleted AS (
        DELETE FROM webauthn_challenges
        WHERE (
          used = true AND created_at < now() - interval '1 day'
        ) OR (
          expires_at < now() - interval '15 minutes'
        )
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted;
    `;

		console.log(`✅ Cleanup complete. Removed ${res[0]?.deleted ?? 0} rows.`);
	} catch (err) {
		console.error('❌ Cleanup failed:', err?.message || err);
		process.exit(1);
	} finally {
		if (client) await client.end().catch(() => {});
	}
}

main();
