// Railway Function: Daily cleanup for WebAuthn challenges
// - Deletes: used challenges older than 1 day
// - Deletes: expired challenges older than 15 minutes past expiry
//
// Usage on Railway Functions:
// - Create a Function in the dashboard and paste this file
// - Ensure env vars: DATABASE_URL (required), DATABASE_SSL=true (if your DB requires SSL)
// - Optional: WEBAUTHN_CLEANUP_SECRET to protect HTTP invocation
// - Create a schedule (e.g., cron "0 3 * * *") to run daily

// Railway Function (Bun runtime) scheduled job
// Calls your app's admin cleanup endpoint once, logs result, and exits.

const endpoint = process.env.CLEANUP_ENDPOINT;
const secret = process.env.WEBAUTHN_CLEANUP_SECRET;

if (!endpoint) {
	console.error('[cleanup] CLEANUP_ENDPOINT is not set');
	// Exit with non-zero so schedule shows failure
	// Bun provides process.exit
	process.exit(1);
}

(async () => {
	try {
		// Build target URL; include secret as query too (defense-in-depth)
		const url = new URL(endpoint);
		if (secret) url.searchParams.set('secret', secret);
		const target = url.toString();

		console.log('[cleanup] Starting…', { endpoint: url.origin + url.pathname });
		const res = await fetch(target, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(secret ? { authorization: `Bearer ${secret}` } : {})
			}
		});

		const text = await res.text();
		console.log('[cleanup] Response:', res.status, text);

		if (!res.ok) {
			console.error('[cleanup] Non-OK status from endpoint');
			process.exit(1);
		}

		console.log('[cleanup] Done.');
		process.exit(0);
	} catch (err) {
		console.error('[cleanup] Failed:', err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
})();
