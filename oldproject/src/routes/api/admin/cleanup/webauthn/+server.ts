import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { sql } from 'drizzle-orm';

function isAuthorized(request: Request): boolean {
	const secret = process.env.WEBAUTHN_CLEANUP_SECRET;
	if (!secret) return false;
	const auth = request.headers.get('authorization') || '';
	const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
	const url = new URL(request.url);
	const q = url.searchParams.get('secret');
	return token === secret || q === secret;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!isAuthorized(request)) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const database = db();
		if (!database) return json({ error: 'Database not configured' }, { status: 500 });

		const started = Date.now();

		// Delete used > 1 day
		const delUsed: any = await database.execute(sql`
      DELETE FROM "webauthn_challenges"
      WHERE "used" = true AND "created_at" < now() - interval '1 day'
      RETURNING "id";
    `);
		const deletedUsed = Array.isArray(delUsed) ? delUsed.length : ((delUsed as any)?.rowCount ?? 0);

		// Delete expired > 15 minutes past expiry
		const delExpired: any = await database.execute(sql`
      DELETE FROM "webauthn_challenges"
      WHERE "expires_at" < now() - interval '15 minutes'
      RETURNING "id";
    `);
		const deletedExpired = Array.isArray(delExpired)
			? delExpired.length
			: ((delExpired as any)?.rowCount ?? 0);

		const durationMs = Date.now() - started;
		return json({
			ok: true,
			deleted: deletedUsed + deletedExpired,
			deletedUsed,
			deletedExpired,
			durationMs
		});
	} catch (err: any) {
		return json({ ok: false, error: err?.message || String(err) }, { status: 500 });
	}
};
