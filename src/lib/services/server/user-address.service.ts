/**
 * @fileoverview User Address Service
 *
 * Service for managing user Starknet addresses, including automatic
 * registration during account deployment and address management.
 *
 * @author bim
 * @version 1.0.0
 */

import { eq, and } from 'drizzle-orm';
import { db, userAddresses, type NewUserAddress } from '$lib/db';
import { validateStarknetAddress } from '$lib/middleware/validation/starknet';
import { logger } from '$lib/utils/logger';

/**
 * Result of address registration operation
 */
export interface AddressRegistrationResult {
	success: boolean;
	addressId?: string;
	error?: string;
	alreadyExists?: boolean;
}

/**
 * Service for managing user addresses
 */
export class UserAddressService {
	private static instance: UserAddressService;

	private constructor() {}

	static getInstance(): UserAddressService {
		if (!UserAddressService.instance) {
			UserAddressService.instance = new UserAddressService();
		}
		return UserAddressService.instance;
	}

	/**
	 * Register a Starknet address for a user
	 * @param userId The user's ID
	 * @param starknetAddress The Starknet address to register
	 * @param addressType Type of address (default: 'main')
	 * @param skipValidation Skip address format validation (default: false)
	 */
	async registerAddress(
		userId: string,
		starknetAddress: string,
		addressType: string = 'main',
		skipValidation: boolean = false
	): Promise<AddressRegistrationResult> {
		try {
			const database = db();
			if (!database) {
				return {
					success: false,
					error: 'Database not configured'
				};
			}

			// Validate address format unless skipped
			if (!skipValidation && !validateStarknetAddress(starknetAddress)) {
				return {
					success: false,
					error: 'Invalid Starknet address format'
				};
			}

			// Normalize the address (ensure 0x prefix and proper format)
			const normalizedAddress = this.normalizeAddress(starknetAddress);

			// Check if address is already registered for this user
			const existingAddress = await database
				.select()
				.from(userAddresses)
				.where(
					and(
						eq(userAddresses.userId, userId),
						eq(userAddresses.starknetAddress, normalizedAddress)
					)
				)
				.limit(1);

			if (existingAddress.length > 0) {
				logger.info(`Address ${normalizedAddress} already registered for user ${userId}`);
				return {
					success: true,
					addressId: existingAddress[0].id,
					alreadyExists: true
				};
			}

			// Register the new address
			const newAddress = await database
				.insert(userAddresses)
				.values({
					userId,
					starknetAddress: normalizedAddress,
					addressType,
					isActive: true
				})
				.returning();

			logger.info(`Successfully registered address ${normalizedAddress} for user ${userId}`);

			return {
				success: true,
				addressId: newAddress[0].id
			};
		} catch (error) {
			logger.error('Error registering address', error as Error);
			return {
				success: false,
				error: 'Failed to register address'
			};
		}
	}

	/**
	 * Auto-register address during account deployment
	 * This is called automatically when a user deploys their account
	 */
	async autoRegisterDeployedAddress(
		userId: string,
		starknetAddress: string
	): Promise<AddressRegistrationResult> {
		logger.info(`Auto-registering deployed address ${starknetAddress} for user ${userId}`);

		return this.registerAddress(
			userId,
			starknetAddress,
			'main', // Primary deployed account
			true // Skip validation since this comes from our own deployment
		);
	}

	/**
	 * Get all addresses for a user
	 */
	async getUserAddresses(userId: string) {
		const database = db();
		if (!database) {
			throw new Error('Database not configured');
		}

		return await database
			.select({
				id: userAddresses.id,
				starknetAddress: userAddresses.starknetAddress,
				addressType: userAddresses.addressType,
				isActive: userAddresses.isActive,
				registeredAt: userAddresses.registeredAt,
				lastScannedBlock: userAddresses.lastScannedBlock
			})
			.from(userAddresses)
			.where(eq(userAddresses.userId, userId))
			.orderBy(userAddresses.registeredAt);
	}

	/**
	 * Deactivate an address (stop tracking)
	 */
	async deactivateAddress(userId: string, addressId: string): Promise<boolean> {
		try {
			const database = db();
			if (!database) return false;

			const result = await database
				.update(userAddresses)
				.set({ isActive: false })
				.where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)));

			return result.rowCount ? result.rowCount > 0 : false;
		} catch (error) {
			logger.error('Error deactivating address', error as Error);
			return false;
		}
	}

	/**
	 * Reactivate an address (resume tracking)
	 */
	async reactivateAddress(userId: string, addressId: string): Promise<boolean> {
		try {
			const database = db();
			if (!database) return false;

			const result = await database
				.update(userAddresses)
				.set({ isActive: true })
				.where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)));

			return result.rowCount ? result.rowCount > 0 : false;
		} catch (error) {
			logger.error('Error reactivating address', error as Error);
			return false;
		}
	}

	/**
	 * Normalize address format (ensure 0x prefix)
	 */
	private normalizeAddress(address: string): string {
		const cleaned = address.toLowerCase().trim();
		return cleaned.startsWith('0x') ? cleaned : `0x${cleaned}`;
	}
}

// Export singleton instance
export const userAddressService = UserAddressService.getInstance();
