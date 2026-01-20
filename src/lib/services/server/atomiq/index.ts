/**
 * @fileoverview Main Atomiq Service Orchestrator (Refactored)
 *
 * This is the main entry point for the Atomiq cross-chain swap services.
 * Refactored to use focused service architecture for better maintainability.
 *
 * @author bim
 * @version 2.0.0
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { handleServiceInitializationError } from './error-handlers';

// Import service modules
import { AtomiqConfigService } from './config/atomiq-config.service';
import { SDKInitializerService } from './initialization/sdk-initializer.service';
import { ServicesInitializerService } from './initialization/services-initializer.service';
import { AssetOperationsService } from './operations/asset-operations.service';
import { SwapOperationsService } from './operations/swap-operations.service';

// Re-export types for external use
export * from './types';

// Import types
import type { InitializedServices } from './initialization/services-initializer.service';
import type {
	AssetLimits,
	AtomiqConfig,
	BitcoinSwapRequest,
	BitcoinSwapResponse,
	LightningSwapRequest,
	LightningSwapResponse,
	StarknetToLightningSwapRequest,
	StarknetToLightningSwapResponse,
	SupportedAsset,
	SwapStatusUpdate
} from './types';

/**
 * Main Atomiq Service that orchestrates all swap operations
 */
export class AtomiqService {
	private static instance: AtomiqService;
	private isInitialized = false;

	// Service modules
	private configService: AtomiqConfigService;
	private sdkInitializer: SDKInitializerService;
	private servicesInitializer: ServicesInitializerService | null = null;
	private swapOperations: SwapOperationsService | null = null;
	private assetOperations: AssetOperationsService;

	// SDK components
	private swapperFactory: any = null;
	private swapper: any = null;

	// Initialized services
	private services: InitializedServices | null = null;

	private constructor(config?: AtomiqConfig) {
		this.configService = AtomiqConfigService.getInstance(config);
		this.sdkInitializer = new SDKInitializerService(this.configService.getConfig());
		this.assetOperations = new AssetOperationsService();

		logger.info('AtomiqService created with configuration', {
			bitcoinNetwork: this.configService.getBitcoinNetwork(),
			timeout: this.configService.getTimeout()
		});
	}

	/**
	 * Gets the singleton instance
	 */
	static getInstance(config?: AtomiqConfig): AtomiqService {
		if (!AtomiqService.instance) {
			AtomiqService.instance = new AtomiqService(config);
		}
		return AtomiqService.instance;
	}

	/**
	 * Initializes the Atomiq SDK and all specialized services
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			logger.info('AtomiqService already initialized, skipping');
			return;
		}

		try {
			logger.info('Initializing AtomiqService with refactored architecture');

			// Test connectivity
			await this.configService.testConnectivity();

			// Initialize SDK
			const { swapperFactory, swapper } = await this.sdkInitializer.initializeSDK();
			this.swapperFactory = swapperFactory;
			this.swapper = swapper;

			// Initialize services
			this.servicesInitializer = new ServicesInitializerService(
				this.configService.getConfig(),
				swapperFactory,
				swapper
			);

			this.services = await this.servicesInitializer.initializeServices();

			// Initialize operations services
			this.swapOperations = new SwapOperationsService(
				this.services,
				this.configService.getConfig()
			);

			// Record successful initialization
			monitoring.recordServiceEvent('atomiq_initialized', {
				bitcoinNetwork: this.configService.getBitcoinNetwork()
			});

			this.isInitialized = true;
			logger.info('AtomiqService initialization completed successfully');
		} catch (error) {
			logger.error('AtomiqService initialization failed', error as Error);
			monitoring.recordServiceEvent('atomiq_init_failed', {
				error: error instanceof Error ? error.message : 'unknown'
			});
			handleServiceInitializationError(error);
		}
	}

	/**
	 * Ensures the service is initialized before operations
	 */
	private async ensureInitialized(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize();
		}
	}

	// ===== Asset Operations =====

	async getSupportedAssets(): Promise<Record<SupportedAsset, AssetLimits>> {
		await this.ensureInitialized();
		return await this.assetOperations.getSupportedAssets();
	}

	async getQuote(
		amountSats: number,
		destinationAsset: string
	): Promise<{
		success: boolean;
		quote?: {
			amount: number;
			destinationAsset: string;
			estimatedOutput: number;
			fees: number;
			exchangeRate: number;
		};
		message: string;
	}> {
		await this.ensureInitialized();
		return await this.assetOperations.getQuote(amountSats, destinationAsset);
	}

	// ===== Swap Operations =====

	async createLightningToStarknetSwap(
		request: LightningSwapRequest
	): Promise<LightningSwapResponse> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.createLightningToStarknetSwap(request);
	}

	async createBitcoinSwap(request: BitcoinSwapRequest): Promise<BitcoinSwapResponse> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.createBitcoinSwap(request);
	}

	async createStarknetToLightningSwap(
		request: StarknetToLightningSwapRequest
	): Promise<StarknetToLightningSwapResponse> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.createStarknetToLightningSwap(request);
	}

	async createStarknetToBitcoinSwap(
		request: import('./types').StarknetToBitcoinSwapRequest
	): Promise<import('./types').StarknetToBitcoinSwapResponse> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.createStarknetToBitcoinSwap(request);
	}

	getSwapStatus(swapId: string): SwapStatusUpdate | null {
		if (!this.swapOperations) return null;
		return this.swapOperations.getSwapStatus(swapId);
	}

	/**
	 * Get swap object directly from registry
	 */
	getSwap(swapId: string): any | null {
		if (!this.services?.swapRegistry) return null;
		return this.services.swapRegistry.getSwap(swapId);
	}

	async claimLightningSwap(
		swapId: string,
		starknetSigner?: any
	): Promise<{ success: boolean; txHash?: string; message: string }> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.claimLightningSwap(swapId, starknetSigner);
	}

	async getUnsignedClaimTransactions(swapId: string): Promise<{
		success: boolean;
		transactions?: any[];
		message: string;
	}> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.getUnsignedClaimTransactions(swapId);
	}

	async submitSignedTransactions(
		swapId: string,
		phase: 'commit' | 'claim' | 'commit-and-claim',
		signedTransactions: any[]
	): Promise<{ success: boolean; txHash?: string; message: string }> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.submitSignedTransactions(swapId, phase, signedTransactions);
	}

	async getUnsignedTransactions(swapId: string): Promise<{
		success: boolean;
		transactions?: any[];
		message: string;
	}> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.getUnsignedTransactions(swapId);
	}

	async startPaymentWaitingAfterCommit(swapId: string): Promise<{
		success: boolean;
		message: string;
	}> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.startPaymentWaitingAfterCommit(swapId);
	}

	async waitForCommitConfirmation(swapId: string): Promise<{
		success: boolean;
		message: string;
		finalState?: number;
	}> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.waitForCommitConfirmation(swapId);
	}

	/**
	 * Wait for claim confirmation using Atomiq SDK waitTillClaimed method
	 */
	async waitForClaimConfirmation(swapId: string): Promise<{
		success: boolean;
		message: string;
		finalState?: number;
	}> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.waitForClaimConfirmation(swapId);
	}

	/**
	 * Get current swap state
	 */
	async getSwapState(swapId: string): Promise<{
		success: boolean;
		message: string;
		state?: number;
	}> {
		await this.ensureInitialized();
		if (!this.swapOperations) throw new Error('Swap operations not initialized');
		return await this.swapOperations.getSwapState(swapId);
	}

	/**
	 * Checks if the service is ready for operations
	 */
	isReady(): boolean {
		return (
			this.isInitialized &&
			this.swapperFactory !== null &&
			this.swapper !== null &&
			this.services !== null &&
			this.swapOperations !== null
		);
	}

	/**
	 * Cleanup method for graceful shutdown
	 */
	async cleanup(): Promise<void> {
		logger.info('Cleaning up AtomiqService...');

		if (this.services?.swapRegistry) {
			this.services.swapRegistry.shutdown();
		}

		this.isInitialized = false;
		logger.info('AtomiqService cleanup completed');
	}
}

// Export factory function instead of singleton to prevent build-time initialization
export const getAtomiqService = (config?: AtomiqConfig): AtomiqService => {
	return AtomiqService.getInstance(config);
};
