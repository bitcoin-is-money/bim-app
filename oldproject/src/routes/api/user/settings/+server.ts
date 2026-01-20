/**
 * @fileoverview User Settings API Endpoints
 *
 * RESTful API endpoints for managing user settings and preferences.
 * Provides GET and PUT operations for user-specific configuration.
 *
 * Endpoints:
 * - GET /api/user/settings - Get current user settings
 * - PUT /api/user/settings - Update user settings
 *
 * Authentication:
 * - Requires valid session authentication
 * - Settings are tied to authenticated user
 *
 * @author bim
 * @version 1.0.0
 */

import { validateSession } from '$lib/auth/session';
import { userSettingsService } from '$lib/services/server/user-settings.service';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/user/settings
 *
 * Retrieves the current user's settings and preferences.
 * If no settings exist, creates default settings automatically.
 *
 * Response:
 * - 200: Settings retrieved successfully
 * - 401: User not authenticated
 * - 500: Server error
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/user/settings');
 * const settings = await response.json();
 * console.log('User currency:', settings.fiatCurrency);
 * ```
 */
export const GET: RequestHandler = async ({ request, cookies }) => {
	try {
		// Validate user session
		const sessionId = cookies.get('session');
		if (!sessionId) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const user = await validateSession(sessionId);
		if (!user || !user.id) {
			return json({ error: 'Invalid session' }, { status: 401 });
		}

		// Get or create user settings
		const settings = await userSettingsService.getOrCreateUserSettings(user.id);

		return json({
			success: true,
			data: settings,
			message: 'Settings retrieved successfully'
		});
	} catch (error) {
		console.error('GET /api/user/settings error:', error);
		return json(
			{
				success: false,
				error: 'Failed to retrieve user settings',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/user/settings
 *
 * Updates the current user's settings with provided values.
 * Only updates fields that are provided in the request body.
 *
 * Request Body:
 * - fiatCurrency?: string - User's preferred fiat currency
 *
 * Response:
 * - 200: Settings updated successfully
 * - 400: Invalid request data
 * - 401: User not authenticated
 * - 500: Server error
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/user/settings', {
 *   method: 'PUT',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ fiatCurrency: 'EUR' })
 * });
 * ```
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
	try {
		// Validate user session
		const sessionId = cookies.get('session');
		if (!sessionId) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		const user = await validateSession(sessionId);
		if (!user || !user.id) {
			return json({ error: 'Invalid session' }, { status: 401 });
		}

		// Parse request body
		const requestData = await request.json();

		// Validate request data structure
		const updates: { fiatCurrency?: string } = {};

		if ('fiatCurrency' in requestData) {
			if (typeof requestData.fiatCurrency !== 'string') {
				return json({ error: 'Invalid fiatCurrency: must be a string' }, { status: 400 });
			}
			updates.fiatCurrency = requestData.fiatCurrency;
		}

		// Check if we have any valid updates
		if (Object.keys(updates).length === 0) {
			return json({ error: 'No valid settings provided for update' }, { status: 400 });
		}

		// Ensure user has settings record first
		await userSettingsService.getOrCreateUserSettings(user.id);

		// Update user settings
		const updatedSettings = await userSettingsService.updateUserSettings(user.id, updates);

		return json({
			success: true,
			data: updatedSettings,
			message: 'Settings updated successfully'
		});
	} catch (error) {
		console.error('PUT /api/user/settings error:', error);

		// Handle specific validation errors
		if (error instanceof Error && error.message.includes('Unsupported currency')) {
			return json(
				{
					success: false,
					error: 'Invalid currency',
					details: error.message,
					supportedCurrencies: userSettingsService.getSupportedCurrencies()
				},
				{ status: 400 }
			);
		}

		return json(
			{
				success: false,
				error: 'Failed to update user settings',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
