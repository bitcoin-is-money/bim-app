/**
 * @fileoverview User Settings Service
 *
 * Provides server-side operations for managing user settings and preferences.
 * This service handles CRUD operations for user-specific configuration including
 * fiat currency preferences and other personalization options.
 *
 * Features:
 * - Type-safe database operations using Drizzle ORM
 * - Automatic settings initialization for new users
 * - Currency validation against supported currencies
 * - Error handling and logging for debugging
 * - One-to-one relationship management with users
 *
 * @author bim
 * @version 1.0.0
 */

import { db, userSettings, type NewUserSettings, type UserSettings } from '$lib/db';
import { eq } from 'drizzle-orm';

/**
 * Supported fiat currencies for user preferences
 *
 * This list defines all currencies that users can select as their preferred
 * fiat currency for balance display and conversions.
 */
export const SUPPORTED_CURRENCIES = [
	'USD', // US Dollar
	'EUR', // Euro
	'GBP', // British Pound
	'JPY', // Japanese Yen
	'CAD', // Canadian Dollar
	'AUD', // Australian Dollar
	'CHF', // Swiss Franc
	'CNY', // Chinese Yuan
	'KRW', // South Korean Won
	'INR' // Indian Rupee
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * User Settings Service Class
 *
 * Provides methods for managing user preferences and settings.
 * Implements a service layer pattern with proper error handling
 * and type safety.
 */
export class UserSettingsService {
	/**
	 * Get user settings by user ID
	 *
	 * Retrieves the settings record for a specific user. If no settings
	 * exist, this will return null - use getOrCreateUserSettings for
	 * automatic initialization.
	 *
	 * @param userId - UUID of the user
	 * @returns Promise<UserSettings | null> - User settings or null if not found
	 *
	 * @example
	 * ```typescript
	 * const settings = await service.getUserSettings(userId);
	 * if (settings) {
	 *   console.log('User prefers:', settings.fiatCurrency);
	 * }
	 * ```
	 */
	async getUserSettings(userId: string): Promise<UserSettings | null> {
		try {
			const database = db();
			if (!database) {
				throw new Error('Database not available');
			}

			const result = await database
				.select()
				.from(userSettings)
				.where(eq(userSettings.userId, userId))
				.limit(1);

			return result[0] || null;
		} catch (error) {
			console.error('Error fetching user settings:', error);
			throw new Error('Failed to fetch user settings');
		}
	}

	/**
	 * Get or create user settings with defaults
	 *
	 * Retrieves existing user settings or creates a new record with
	 * default values if none exists. This ensures every user has
	 * settings available.
	 *
	 * @param userId - UUID of the user
	 * @returns Promise<UserSettings> - User settings (existing or newly created)
	 *
	 * @example
	 * ```typescript
	 * const settings = await service.getOrCreateUserSettings(userId);
	 * // Settings are guaranteed to exist
	 * console.log('Currency:', settings.fiatCurrency);
	 * ```
	 */
	async getOrCreateUserSettings(userId: string): Promise<UserSettings> {
		try {
			// Try to get existing settings first
			const existingSettings = await this.getUserSettings(userId);
			if (existingSettings) {
				return existingSettings;
			}

			// Create new settings with defaults
			const newSettings: NewUserSettings = {
				userId,
				fiatCurrency: 'USD' // Default currency
			};

			return await this.createUserSettings(newSettings);
		} catch (error) {
			console.error('Error getting or creating user settings:', error);
			throw new Error('Failed to initialize user settings');
		}
	}

	/**
	 * Create new user settings record
	 *
	 * Creates a new settings record for a user. This is typically called
	 * automatically during user registration or by getOrCreateUserSettings.
	 *
	 * @param settings - New user settings data
	 * @returns Promise<UserSettings> - Created settings record
	 *
	 * @example
	 * ```typescript
	 * const newSettings = await service.createUserSettings({
	 *   userId: 'user-uuid',
	 *   fiatCurrency: 'EUR'
	 * });
	 * ```
	 */
	async createUserSettings(settings: NewUserSettings): Promise<UserSettings> {
		try {
			const database = db();
			if (!database) {
				throw new Error('Database not available');
			}

			// Validate currency before creating
			if (settings.fiatCurrency && !this.isValidCurrency(settings.fiatCurrency)) {
				throw new Error(`Unsupported currency: ${settings.fiatCurrency}`);
			}

			const result = await database.insert(userSettings).values(settings).returning();

			return result[0];
		} catch (error) {
			console.error('Error creating user settings:', error);
			throw new Error('Failed to create user settings');
		}
	}

	/**
	 * Update user settings
	 *
	 * Updates specific fields in a user's settings record. Only provided
	 * fields will be updated, others remain unchanged.
	 *
	 * @param userId - UUID of the user
	 * @param updates - Partial settings object with fields to update
	 * @returns Promise<UserSettings> - Updated settings record
	 *
	 * @example
	 * ```typescript
	 * const updated = await service.updateUserSettings(userId, {
	 *   fiatCurrency: 'GBP'
	 * });
	 * ```
	 */
	async updateUserSettings(
		userId: string,
		updates: Partial<Pick<UserSettings, 'fiatCurrency'>>
	): Promise<UserSettings> {
		try {
			const database = db();
			if (!database) {
				throw new Error('Database not available');
			}

			// Validate currency if provided
			if (updates.fiatCurrency && !this.isValidCurrency(updates.fiatCurrency)) {
				throw new Error(`Unsupported currency: ${updates.fiatCurrency}`);
			}

			// Update settings with current timestamp
			const result = await database
				.update(userSettings)
				.set({
					...updates,
					updatedAt: new Date()
				})
				.where(eq(userSettings.userId, userId))
				.returning();

			if (!result[0]) {
				throw new Error('Settings not found for user');
			}

			return result[0];
		} catch (error) {
			console.error('Error updating user settings:', error);
			throw new Error('Failed to update user settings');
		}
	}

	/**
	 * Delete user settings
	 *
	 * Removes a user's settings record. This is typically only needed
	 * during user account deletion (handled automatically by CASCADE).
	 *
	 * @param userId - UUID of the user
	 * @returns Promise<boolean> - True if settings were deleted
	 */
	async deleteUserSettings(userId: string): Promise<boolean> {
		try {
			const database = db();
			if (!database) {
				throw new Error('Database not available');
			}

			const result = await database
				.delete(userSettings)
				.where(eq(userSettings.userId, userId))
				.returning();

			return result.length > 0;
		} catch (error) {
			console.error('Error deleting user settings:', error);
			throw new Error('Failed to delete user settings');
		}
	}

	/**
	 * Validate if a currency is supported
	 *
	 * Checks if the provided currency code is in the list of supported
	 * currencies for the application.
	 *
	 * @param currency - Currency code to validate
	 * @returns boolean - True if currency is supported
	 */
	isValidCurrency(currency: string): currency is SupportedCurrency {
		return SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
	}

	/**
	 * Get list of all supported currencies
	 *
	 * Returns the complete list of currencies that users can select
	 * as their preferred fiat currency.
	 *
	 * @returns SupportedCurrency[] - Array of supported currency codes
	 */
	getSupportedCurrencies(): readonly SupportedCurrency[] {
		return SUPPORTED_CURRENCIES;
	}
}

// Export singleton instance for consistent usage
export const userSettingsService = new UserSettingsService();
