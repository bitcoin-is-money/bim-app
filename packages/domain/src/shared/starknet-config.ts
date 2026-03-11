import type {StarknetAddress} from '../account';

/**
 * Starknet environment configuration.
 * Contains token addresses and other chain-specific settings.
 * Token addresses are validated as StarknetAddress at construction time.
 */
export interface StarknetConfig {
  readonly wbtcTokenAddress: StarknetAddress;
  readonly strkTokenAddress: StarknetAddress;
}
