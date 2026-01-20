import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { StarknetInitializer } from '@atomiqlabs/chain-starknet';
import type { MultichainSwapperOptions } from '@atomiqlabs/sdk';
import { BitcoinNetwork, Swapper, SwapperFactory } from '@atomiqlabs/sdk';
import { SqliteStorageManager, SqliteUnifiedStorage } from '@atomiqlabs/storage-sqlite';
import { getPrimaryIntermediaryUrl } from '../config';
import type { AtomiqConfig } from '../types';

export interface SDKInitializationResult {
	swapperFactory: SwapperFactory<any>;
	swapper: Swapper<any>;
}

export class SDKInitializerService {
	private config: AtomiqConfig;

	constructor(config: AtomiqConfig) {
		this.config = config;
	}

	async getSDKVersionInfo(): Promise<any> {
		try {
			const fs = await import('fs/promises');
			const path = await import('path');

			const packagePath = path.join(process.cwd(), 'node_modules/@atomiqlabs/sdk/package.json');
			const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8'));

			return {
				sdkVersion: packageJson.version,
				sdkName: packageJson.name
			};
		} catch (error) {
			return {
				error: `Failed to read SDK version: ${error instanceof Error ? error.message : 'unknown'}`
			};
		}
	}

	async createSwapperFactory(): Promise<SwapperFactory<any>> {
		logger.info('Creating SwapperFactory with chain initializers...');

		try {
			logger.info('Checking StarknetInitializer availability', {
				hasStarknetInitializer: !!StarknetInitializer,
				initializerType: StarknetInitializer ? StarknetInitializer.constructor.name : 'null',
				initializerMethods: StarknetInitializer
					? Object.getOwnPropertyNames(StarknetInitializer)
					: []
			});

			logger.info('Creating SwapperFactory with initializers...');
			const swapperFactory = new SwapperFactory([StarknetInitializer as any]);

			logger.info('SwapperFactory created successfully', {
				hasFactory: !!swapperFactory,
				factoryType: swapperFactory ? swapperFactory.constructor.name : 'null',
				factoryMethods: swapperFactory
					? Object.getOwnPropertyNames(Object.getPrototypeOf(swapperFactory))
					: []
			});

			return swapperFactory;
		} catch (error) {
			logger.error('SwapperFactory creation failed', error as Error, {
				initializerAvailable: !!StarknetInitializer,
				errorType: error instanceof Error ? error.constructor.name : typeof error
			});
			throw new Error(
				`SwapperFactory creation failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async createSwapper(swapperFactory: SwapperFactory<any>): Promise<any> {
		const bitcoinNetworkEnum =
			this.config.bitcoinNetwork === 'mainnet' ? BitcoinNetwork.MAINNET : BitcoinNetwork.TESTNET;

		logger.info('Creating Swapper...', {
			bitcoinNetwork: this.config.bitcoinNetwork,
			bitcoinNetworkEnum: bitcoinNetworkEnum,
			hasSwapperFactory: !!swapperFactory,
			swapperFactoryType: swapperFactory ? swapperFactory.constructor.name : 'null'
		});

		try {
			if (!swapperFactory) {
				throw new Error('SwapperFactory is null or undefined');
			}

			if (typeof swapperFactory.newSwapper !== 'function') {
				logger.error('SwapperFactory validation failed', null, {
					hasNewSwapperMethod: typeof swapperFactory.newSwapper,
					availableMethods: Object.getOwnPropertyNames(swapperFactory),
					factoryPrototype: Object.getOwnPropertyNames(Object.getPrototypeOf(swapperFactory))
				});
				throw new Error('SwapperFactory.newSwapper is not a function');
			}

			const intermediaryUrl = getPrimaryIntermediaryUrl(this.config);

			const swapperOptions: MultichainSwapperOptions<any> = {
				bitcoinNetwork: bitcoinNetworkEnum,
				chains: {
					STARKNET: {
						rpcUrl: this.config.starknetRpcUrl
					}
				},
				swapStorage: (chainId) => {
					logger.debug('Creating swap storage', { chainId });
					return new SqliteUnifiedStorage('CHAIN_' + chainId + '.sqlite3');
				},
				chainStorageCtor: (name) => {
					logger.debug('Creating chain storage', { name });
					return new SqliteStorageManager('STORE_' + name + '.sqlite3');
				}
			};

			// Only add intermediaryUrl if it's not null to avoid potential issues
			if (intermediaryUrl) {
				swapperOptions.intermediaryUrl = intermediaryUrl;
			}

			logger.info('Creating swapper with options', {
				bitcoinNetwork: this.config.bitcoinNetwork,
				starknetRpcUrl: this.config.starknetRpcUrl?.substring(0, 50) + '...',
				chainConfigComplete: !!this.config.starknetRpcUrl,
				hasIntermediaryUrl: !!intermediaryUrl,
				intermediaryUrl: intermediaryUrl ? intermediaryUrl.substring(0, 50) + '...' : 'none'
			});

			logger.info('Calling swapperFactory.newSwapper...');
			const swapper = swapperFactory.newSwapper(swapperOptions);
			logger.info('SwapperFactory.newSwapper completed', {
				swapperCreated: !!swapper,
				swapperType: swapper ? swapper.constructor.name : 'null'
			});

			if (!swapper) {
				throw new Error('Swapper creation returned null or undefined');
			}

			logger.info('Swapper created successfully', {
				bitcoinNetwork: this.config.bitcoinNetwork,
				hasSwapper: !!swapper,
				swapperChains: swapper.chains ? Object.keys(swapper.chains) : 'no chains property',
				swapperMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(swapper))
			});

			// Initialize the swapper to set up storage and load existing swaps
			logger.info('Initializing swapper storage and loading existing swaps...');
			await swapper.init();
			logger.info('Swapper initialization completed successfully');

			return swapper;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'unknown error';
			logger.error('Swapper creation failed', error as Error, {
				errorMessage,
				bitcoinNetwork: this.config.bitcoinNetwork,
				starknetRpcUrl: this.config.starknetRpcUrl?.substring(0, 50) + '...',
				hasSwapperFactory: !!swapperFactory
			});

			if (errorMessage.includes('null') || errorMessage.includes('undefined')) {
				throw new Error(
					`Swapper creation failed: ${errorMessage}. Check SwapperFactory and storage initialization.`
				);
			} else if (errorMessage.includes('function')) {
				throw new Error(
					`Swapper creation failed: ${errorMessage}. Use newSwapper() method instead of createSwapper().`
				);
			} else if (errorMessage.includes('chains') || errorMessage.includes('STARKNET')) {
				throw new Error(
					`Swapper chain configuration failed: ${errorMessage}. Check Starknet options.`
				);
			} else if (
				errorMessage.includes('storage') ||
				errorMessage.includes('SQLite') ||
				errorMessage.includes('init')
			) {
				throw new Error(
					`Swapper storage initialization failed: ${errorMessage}. Check storage configuration and database permissions.`
				);
			}

			throw new Error(`Swapper creation failed: ${errorMessage}`);
		}
	}

	async initializeSDK(): Promise<SDKInitializationResult> {
		const startTime = Date.now();

		try {
			logger.info('Starting SDK initialization process', {
				bitcoinNetwork: this.config.bitcoinNetwork,
				rpcUrl: this.config.starknetRpcUrl?.substring(0, 50) + '...'
			});

			// Step 1: Get SDK version info
			logger.info('Step 1/5: Getting SDK version information...');
			const sdkInfo = await this.getSDKVersionInfo();
			logger.info('SDK Information retrieved', sdkInfo);

			// Step 4: Create SwapperFactory
			logger.info('Step 4/5: Creating SwapperFactory...');
			const swapperFactory = await this.createSwapperFactory();
			logger.info('SwapperFactory creation completed', {
				factoryReady: !!swapperFactory,
				hasNewSwapperMethod: !!(swapperFactory && typeof swapperFactory.newSwapper === 'function')
			});

			// Step 5: Create Swapper
			logger.info('Step 5/5: Creating Swapper...');
			const swapper = await this.createSwapper(swapperFactory);
			logger.info('Swapper creation completed', {
				swapperReady: !!swapper,
				hasInitMethod: !!(swapper && typeof swapper.init === 'function')
			});

			// Final verification
			logger.info('Performing final SDK verification...');
			if (!swapperFactory) {
				throw new Error('SwapperFactory creation failed - object is null');
			}
			if (!swapper) {
				throw new Error('Swapper creation failed - object is null');
			}

			const initializationTime = Date.now() - startTime;
			logger.info('SDK initialization completed successfully', {
				hasSwapperFactory: !!swapperFactory,
				hasSwapper: !!swapper,
				bitcoinNetwork: this.config.bitcoinNetwork,
				initializationTime: `${initializationTime}ms`
			});

			// Record successful initialization
			monitoring.recordServiceEvent('atomiq_sdk_initialized', {
				bitcoinNetwork: this.config.bitcoinNetwork,
				sdkVersion: sdkInfo.sdkVersion || 'unknown',
				initializationTime
			});

			return {
				swapperFactory,
				swapper
			};
		} catch (error) {
			const initializationTime = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : 'unknown';

			logger.error('SDK initialization failed', error as Error, {
				errorMessage,
				bitcoinNetwork: this.config.bitcoinNetwork,
				initializationTime: `${initializationTime}ms`,
				failureStep: this.identifyFailureStep(errorMessage)
			});

			monitoring.recordServiceEvent('atomiq_sdk_init_failed', {
				error: errorMessage,
				bitcoinNetwork: this.config.bitcoinNetwork,
				initializationTime,
				failureStep: this.identifyFailureStep(errorMessage)
			});

			throw error;
		}
	}

	private identifyFailureStep(errorMessage: string): string {
		if (errorMessage.includes('storage') || errorMessage.includes('SQLite')) {
			return 'storage_initialization';
		} else if (
			errorMessage.includes('Starknet') ||
			errorMessage.includes('RPC') ||
			errorMessage.includes('configuration')
		) {
			return 'starknet_configuration_validation';
		} else if (
			errorMessage.includes('SwapperFactory') ||
			errorMessage.includes('StarknetInitializer')
		) {
			return 'swapper_factory_creation';
		} else if (
			errorMessage.includes('Swapper') ||
			errorMessage.includes('newSwapper') ||
			errorMessage.includes('chains')
		) {
			return 'swapper_creation';
		} else if (errorMessage.includes('SDK') || errorMessage.includes('version')) {
			return 'sdk_info_retrieval';
		}
		return 'unknown_step';
	}
}
