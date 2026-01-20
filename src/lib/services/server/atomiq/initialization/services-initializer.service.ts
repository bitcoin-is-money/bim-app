import { logger } from '$lib/utils/logger';
import { BitcoinSwapsService } from '../bitcoin-swaps.service';
import { LightningToStarknetService } from '../lightningToStarknet.service';
import { StarknetToLightningService } from '../starknetToLightning.service';
import { StarknetToBitcoinService } from '../starknetToBitcoin.service';
import { SwapRegistry } from '../swap-registry';
import type { AtomiqConfig } from '../types';

import { SwapMonitorService } from '../swap-monitor.service';
import { SwapClaimerService } from '../swap-claimer.service';

export interface InitializedServices {
	lightningToStarknetService: LightningToStarknetService;
	bitcoinSwapsService: BitcoinSwapsService;
	starknetToLightningService: StarknetToLightningService;
	starknetToBitcoinService: StarknetToBitcoinService;
	swapRegistry: SwapRegistry;
	swapMonitorService?: SwapMonitorService;
	swapClaimerService?: SwapClaimerService;
}

export class ServicesInitializerService {
	private config: AtomiqConfig;
	private swapperFactory: any;
	private swapper: any;

	constructor(config: AtomiqConfig, swapperFactory: any, swapper: any) {
		this.config = config;
		this.swapperFactory = swapperFactory;
		this.swapper = swapper;
	}

	async initializeServices(): Promise<InitializedServices> {
		logger.info('Initializing specialized services...');

		// Initialize registry first (others depend on it)
		const swapRegistry = SwapRegistry.getInstance();

		// Initialize monitoring services with registry reference
		const swapMonitorService = new SwapMonitorService(swapRegistry);
		const swapClaimerService = new SwapClaimerService(this.config);

		// Initialize swap services
		const lightningToStarknetService = new LightningToStarknetService(
			this.config,
			this.swapperFactory,
			this.swapper
		);

		const bitcoinSwapsService = new BitcoinSwapsService(
			this.config,
			this.swapperFactory,
			this.swapper
		);

		const starknetToLightningService = new StarknetToLightningService(
			this.config,
			this.swapperFactory,
			this.swapper
		);

		const starknetToBitcoinService = new StarknetToBitcoinService(
			this.config,
			this.swapperFactory,
			this.swapper
		);

		logger.info('All specialized services initialized successfully', {
			hasSwapRegistry: !!swapRegistry,
			hasSwapMonitorService: !!swapMonitorService,
			hasSwapClaimerService: !!swapClaimerService,
			hasLightningToStarknetService: !!lightningToStarknetService,
			hasBitcoinSwapsService: !!bitcoinSwapsService,
			hasStarknetToLightningService: !!starknetToLightningService,
			hasStarknetToBitcoinService: !!starknetToBitcoinService
		});

		return {
			lightningToStarknetService,
			bitcoinSwapsService,
			starknetToLightningService,
			starknetToBitcoinService,
			swapRegistry,
			swapMonitorService,
			swapClaimerService
		};
	}
}
