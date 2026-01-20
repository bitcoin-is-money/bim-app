/**
 * @fileoverview Atomiq Assets Utility (Server-side)
 *
 * Server-side utility for getting supported assets from the Atomiq SDK.
 * This ensures we have a single source of truth for supported assets
 * instead of hardcoding them throughout the codebase.
 *
 * @author bim
 * @version 1.0.0
 */

import { getAtomiqService } from './index';
import type { SupportedAsset } from './types';
import { logger } from '$lib/utils/logger';

/**
 * Get supported assets as a string array from the Atomiq SDK
 * @returns Promise resolving to array of supported asset symbols
 */
export async function getSupportedAssets(): Promise<string[]> {
	try {
		const supportedAssets = await getAtomiqService().getSupportedAssets();
		return Object.keys(supportedAssets) as string[];
	} catch (error) {
		logger.error('Failed to get supported assets from Atomiq SDK', error as Error);
		// Fallback to empty array to prevent crashes, but log the error
		return [];
	}
}

/**
 * Get supported assets as SupportedAsset array from the Atomiq SDK
 * @returns Promise resolving to array of supported assets with proper typing
 */
export async function getSupportedAssetsTyped(): Promise<SupportedAsset[]> {
	try {
		const supportedAssets = await getAtomiqService().getSupportedAssets();
		return Object.keys(supportedAssets) as SupportedAsset[];
	} catch (error) {
		logger.error('Failed to get supported assets from Atomiq SDK', error as Error);
		// Fallback to empty array to prevent crashes, but log the error
		return [];
	}
}

/**
 * Check if an asset is supported by querying the Atomiq SDK
 * @param asset - The asset symbol to check
 * @returns Promise resolving to boolean indicating if asset is supported
 */
export async function isAssetSupported(asset: string): Promise<boolean> {
	try {
		const supportedAssets = await getAtomiqService().getSupportedAssets();
		return Object.keys(supportedAssets).includes(asset);
	} catch (error) {
		logger.error('Failed to check if asset is supported', error as Error, {
			asset
		});
		return false;
	}
}

/**
 * Get supported assets with their limits from the Atomiq SDK
 * @returns Promise resolving to the full supported assets record with limits
 */
export async function getSupportedAssetsWithLimits(): Promise<Record<SupportedAsset, any>> {
	try {
		return await getAtomiqService().getSupportedAssets();
	} catch (error) {
		logger.error('Failed to get supported assets with limits from Atomiq SDK', error as Error);
		return {} as Record<SupportedAsset, any>;
	}
}
