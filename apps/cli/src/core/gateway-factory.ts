import {HealthRegistry} from '@bim/domain/health';
import {createLogger} from '@bim/lib/logger';
import {
  type AvnuPaymasterConfig,
  AvnuPaymasterGateway,
  type StarknetGatewayConfig,
  StarknetRpcGateway,
} from '@bim/starknet';
import type {Logger} from 'pino';
import {
  AVNU_PAYMASTER_URLS,
  AVNU_SPONSOR_ACTIVITY_URLS,
  BIM_CLASS_HASH,
  type Network,
  RPC_URLS,
  STRK_TOKEN_ADDRESS,
  WBTC_TOKEN_ADDRESS,
} from '../config/constants.js';

export interface CliGateways {
  readonly starknet: StarknetRpcGateway;
  readonly paymaster: AvnuPaymasterGateway;
  readonly logger: Logger;
}

/**
 * Creates the Starknet and AVNU Paymaster gateways pre-configured for a given
 * network. CLI commands use this factory instead of manually wiring gateways.
 */
export function createCliGateways(
  network: Network,
  avnuApiKey: string,
): CliGateways {
  const logger = createLogger('silent');

  // CLI is a short-lived process and does not publish health transitions:
  // provide a standalone registry that just tracks state in memory.
  const healthRegistry = new HealthRegistry(
    ['database', 'starknet-rpc', 'avnu-paymaster', 'atomiq', 'avnu-swap', 'coingecko-price'],
    () => {},
    logger,
  );

  const paymasterConfig: AvnuPaymasterConfig = {
    apiUrl: AVNU_PAYMASTER_URLS[network],
    apiKey: avnuApiKey,
    sponsorActivityUrl: AVNU_SPONSOR_ACTIVITY_URLS[network],
  };
  const paymaster = new AvnuPaymasterGateway(paymasterConfig, logger, healthRegistry);

  const starknetConfig: StarknetGatewayConfig = {
    rpcUrl: RPC_URLS[network],
    accountClassHash: BIM_CLASS_HASH,
    tokenAddresses: {
      STRK: STRK_TOKEN_ADDRESS,
      WBTC: WBTC_TOKEN_ADDRESS,
    },
    // WebAuthn origin/rpId are only used by calculateAccountAddress — CLI
    // commands that need them (e2e:init) will override via a separate gateway.
    webauthnOrigin: 'https://app.bitcoinismoney.app',
    webauthnRpId: 'app.bitcoinismoney.app',
  };
  const starknet = new StarknetRpcGateway(starknetConfig, paymaster, logger, healthRegistry);

  return {starknet, paymaster, logger};
}
