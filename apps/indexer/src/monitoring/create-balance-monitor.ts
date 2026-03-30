import {StarknetAddress} from '@bim/domain/account';
import type {PaymasterGateway} from '@bim/domain/ports';
import {BalanceMonitor, SlackNotificationGateway} from '@bim/monitoring';
import {StarknetRpcGateway} from '@bim/starknet';
import type {Logger} from 'pino';
import type {IndexerConfig} from '../indexer-config';

// The BalanceMonitor only calls getBalance — paymaster methods are never invoked.
const unusedPaymaster = {
  executeTransaction: () => { throw new Error('Not available in indexer'); },
  buildInvokeTransaction: () => { throw new Error('Not available in indexer'); },
  executeInvokeTransaction: () => { throw new Error('Not available in indexer'); },
  buildPaymasterTransaction: () => { throw new Error('Not available in indexer'); },
  isAvailable: () => { throw new Error('Not available in indexer'); },
  getSponsoredGasLimit: () => { throw new Error('Not available in indexer'); },
} satisfies PaymasterGateway;

/**
 * Creates a BalanceMonitor wired with real gateways.
 */
export function createBalanceMonitor(
  config: IndexerConfig.Config,
  alertingConfig: IndexerConfig.AlertingConfig,
  logger: Logger,
): BalanceMonitor {
  const starknetGateway = new StarknetRpcGateway(
    {
      rpcUrl: config.starknetRpcUrl,
      accountClassHash: '',
      // BalanceMonitor passes the token address as the lookup key
      tokenAddresses: {[config.strkTokenAddress]: config.strkTokenAddress},
      webauthnOrigin: '',
      webauthnRpId: '',
    },
    unusedPaymaster,
    logger,
  );

  const notificationGateway = new SlackNotificationGateway(alertingConfig.slack, logger);
  const network = config.starknetNetwork === 'mainnet' ? 'mainnet' : 'testnet';

  return new BalanceMonitor(
    starknetGateway,
    notificationGateway,
    {
      network,
      bitcoinNetwork: network === 'mainnet' ? 'mainnet' : 'testnet',
      rpcUrl: config.starknetRpcUrl,
      accountClassHash: '',
      wbtcTokenAddress: config.wbtcTokenAddress,
      strkTokenAddress: config.strkTokenAddress,
      feeTreasuryAddress: config.treasuryAddress,
    },
    alertingConfig.balanceMonitor,
    logger,
  );
}
