/**
 * Starknet environment configuration.
 * Contains token addresses and other chain-specific settings.
 *
 * @review-accepted: token addresses are plain strings (not StarknetAddress branded type)
 * because they come from environment config and are resolved by the adapter layer.
 * Refactoring to StarknetAddress requires changes across port + adapter + service + routes.
 */
export interface StarknetConfig {
  readonly wbtcTokenAddress: string;
  readonly strkTokenAddress: string;
}
