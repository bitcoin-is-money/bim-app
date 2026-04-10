import type {GetAccountResponse} from '../../../src/routes';
import type {TransferPair} from './e2e-accounts.js';
import type {E2eClient} from './e2e-client.js';

/**
 * Verifies the production server is reachable and healthy.
 * Returns true on success, throws on failure (bail:1 stops the suite).
 */
export async function isServerHealthy(client: E2eClient): Promise<boolean> {
  try {
    const response = await client.get('/api/health');
    if (response.status !== 200) {
      throw new Error(`Server unhealthy (HTTP ${response.status}) at ${client.baseUrl}`);
    }
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Server unhealthy')) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Server unreachable at ${client.baseUrl}: ${message}`);
  }
}

/**
 * Verifies both accounts are deployed and have sufficient WBTC balance.
 * Returns true on success, throws on failure.
 */
export async function areAccountsReady(
  _client: E2eClient,
  pair: TransferPair,
  minWbtcSats: bigint,
): Promise<boolean> {
  for (const user of [pair.sender, pair.receiver]) {
    const info = await user.get<GetAccountResponse>('/api/account/me', `account me (${user.username})`);
    if (info.status !== 'deployed') {
      throw new Error(`Account ${user.username} is not deployed (status: ${info.status})`);
    }
  }

  const senderBalance = pair.sender.getCurrentWbtcBalance();
  if (senderBalance < minWbtcSats) {
    throw new Error(
      `Sender ${pair.sender.username} has insufficient WBTC: ${senderBalance} < ${minWbtcSats}.\n` +
      'Fund with: ./bim e2e:fund',
    );
  }

  return true;
}
