import { RATE_LIMITS } from '$lib/constants';
import { authMiddleware } from '$lib/middleware/auth';
import { getBlockchainScannerService } from '$lib/services/server/blockchain-scanner.service';
import { rateLimit } from '$lib/utils/network/rate-limit';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		// Rate limiting
		const clientIP = event.getClientAddress();
		rateLimit(
			`blockchain_scan:${clientIP}`,
			5, // Allow 5 scan requests per window
			RATE_LIMITS.WINDOW_MS
		);

		// Check if scanner is already running
		const status = getBlockchainScannerService().getStatus();
		if (status.isScanning) {
			return json(
				{
					error: 'Blockchain scan is already in progress',
					status
				},
				{ status: 409 }
			);
		}

		// Start scanning in background
		getBlockchainScannerService().startScanning().catch((error) => {
			console.error('Blockchain scan error:', error);
		});

		return json({
			success: true,
			message: 'Blockchain scan started',
			status: getBlockchainScannerService().getStatus()
		});
	} catch (error) {
		console.error('Blockchain scan trigger error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const GET: RequestHandler = async (event) => {
	try {
		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const status = getBlockchainScannerService().getStatus();

		return json({
			success: true,
			status
		});
	} catch (error) {
		console.error('Blockchain scan status error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
