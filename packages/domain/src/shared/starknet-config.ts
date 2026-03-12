import type {StarknetAddress} from './starknet-address';
import type {BitcoinNetwork, StarknetNetwork} from './network';

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
