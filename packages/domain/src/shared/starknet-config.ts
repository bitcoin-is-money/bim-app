import type {BitcoinNetwork, StarknetNetwork} from './network';
import type {StarknetAddress} from './starknet-address';

/**
 * Starknet environment configuration.
 * Groups all chain-specific settings: network, RPC, token addresses, etc.
 * Token addresses are validated as StarknetAddress at construction time.
 */
export interface StarknetConfig {
  readonly network: StarknetNetwork;
  readonly bitcoinNetwork: BitcoinNetwork;
  readonly rpcUrl: string;
  readonly accountClassHash: string;
  readonly wbtcTokenAddress: StarknetAddress;
  readonly strkTokenAddress: StarknetAddress;
  readonly feeTreasuryAddress: StarknetAddress;
}
