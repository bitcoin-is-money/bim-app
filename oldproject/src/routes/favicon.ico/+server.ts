import { readFileSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		// First try to read favicon.ico
		const faviconIcoPath = join(process.cwd(), 'static', 'favicon.ico');
		const faviconBuffer = readFileSync(faviconIcoPath);

		return new Response(faviconBuffer, {
			headers: {
				'Content-Type': 'image/x-icon',
				'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
			}
		});
	} catch (error) {
		try {
			// Fall back to favicon.png
			const faviconPngPath = join(process.cwd(), 'static', 'favicon.png');
			const faviconBuffer = readFileSync(faviconPngPath);

			return new Response(faviconBuffer, {
				headers: {
					'Content-Type': 'image/png',
					'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
				}
			});
		} catch (fallbackError) {
			// If neither file exists, return a 404
			return new Response('Favicon not found', { status: 404 });
		}
	}
};
