export * from './types';
export * from './errors';
export * from './lightning-invoice';
export {BitcoinAddress} from '../shared/bitcoin-address';
export * from './swap';
export type {ClaimerConfig} from './claimer-config';

// Use case interfaces (primary ports)
export type {
  FetchSwapLimitsInput,
  FetchSwapLimitsOutput,
  FetchSwapLimitsUseCase,
} from './use-cases/fetch-swap-limits.use-case';
export type {
  FetchSwapStatusInput,
  FetchSwapStatusOutput,
  FetchSwapStatusUseCase,
} from './use-cases/fetch-swap-status.use-case';

// Use case implementation (service)
export {SwapReader, type SwapReaderDeps} from './services/swap-reader.service';

// Internal domain service
export {
  SwapCoordinator,
  type SwapCoordinatorDeps,
  type CreateLightningToStarknetInput,
  type CreateLightningToStarknetOutput,
  type PrepareBitcoinToStarknetInput,
  type PrepareBitcoinToStarknetOutput,
  type SaveBitcoinCommitInput,
  type CompleteBitcoinToStarknetInput,
  type CompleteBitcoinToStarknetOutput,
  type CreateStarknetToLightningInput,
  type CreateStarknetToLightningOutput,
  type CreateStarknetToBitcoinInput,
  type CreateStarknetToBitcoinOutput,
} from './services/swap-coordinator.service';
