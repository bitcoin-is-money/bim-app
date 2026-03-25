import type {StarknetAddress} from '../shared';

/**
 * Configuration for the backend Starknet account used to auto-claim
 * forward swaps (Bitcoin/Lightning → Starknet). This account submits
 * the claim transaction on-chain and receives the claimer bounty.
 */
export interface ClaimerConfig {
  readonly privateKey: string;
  readonly address: StarknetAddress;
}
