import {StarknetAddress} from '@bim/domain/account';

export namespace IndexerConfig {

  export interface Config {
    port: number;
    preset: string;
    starknetRpcUrl: string;
    starknetNetwork: string;
    strkTokenAddress: StarknetAddress;
    wbtcTokenAddress: StarknetAddress;
    treasuryAddress: StarknetAddress;
  }

  /**
   * Loads configuration from environment variables.
   * Throws on missing required vars.
   */
  export function load(): Config {
    return {
      port: Number(optional('PORT', '8080')),
      preset: optional('PRESET', 'mainnet'),
      starknetRpcUrl: required('STARKNET_RPC_URL'),
      starknetNetwork: optional('STARKNET_NETWORK', 'mainnet'),
      strkTokenAddress: StarknetAddress.of(required('STRK_TOKEN_ADDRESS')),
      wbtcTokenAddress: StarknetAddress.of(required('WBTC_TOKEN_ADDRESS')),
      treasuryAddress: StarknetAddress.of(required('BIM_TREASURY_ADDRESS')),
    };
  }

  function required(name: string): string {
    // eslint-disable-next-line security/detect-object-injection
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }

  function optional(name: string, defaultValue: string): string {
    // eslint-disable-next-line security/detect-object-injection, @typescript-eslint/prefer-nullish-coalescing
    return process.env[name] || defaultValue;
  }

}
