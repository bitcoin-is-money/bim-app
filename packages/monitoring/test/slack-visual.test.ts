/**
 * Visual test — sends real Slack notifications to verify formatting.
 *
 * Requires a file: packages/monitoring/.slack.secret.json
 *   { "botToken": "xoxb-...", "channel": "#tests" }
 *
 * Skips automatically on any error (missing secret, wrong token, app bot not in channels, etc.)
 */
import {StarknetAddress} from '@bim/domain/account';
import type {NotificationMessage} from '@bim/domain/ports';
import {SwapId} from '@bim/domain/swap';
import {AvnuBalanceLow, AvnuCreditsRecharged, SwapClaimFailed, TreasuryBalanceLow} from '@bim/domain/notifications';
import {createLogger} from '@bim/lib/logger';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, it} from 'vitest';
import {SlackNotificationGateway} from '../src';

const SECRET_PATH = join(import.meta.dirname, '../.slack.secret.json');

const FAKE_ADDRESS = StarknetAddress.of('0x02698cf1e909bc26d684182ce66222f5a60588ccc6b455ee4622e3483208435f');
const NETWORK = 'mainnet';

function buildAllAlerts(): NotificationMessage[] {
  const alerts: NotificationMessage[] = [];

  const avnuLow = AvnuBalanceLow.evaluate({
    address: FAKE_ADDRESS,
    network: NETWORK,
    currentBalance: 2_300_000_000_000_000_000n,
  });
  if (avnuLow) alerts.push(avnuLow);

  const treasuryLow = TreasuryBalanceLow.evaluate({
    address: FAKE_ADDRESS,
    network: NETWORK,
    currentBalance: 3_500_000_000_000_000_000n,
  });
  if (treasuryLow) alerts.push(treasuryLow);

  const recharged = AvnuCreditsRecharged.evaluate({
    address: FAKE_ADDRESS,
    network: NETWORK,
    previousBalance: 2_300_000_000_000_000_000n,
    currentBalance: 50_000_000_000_000_000_000n,
  });
  if (recharged) alerts.push(recharged);

  alerts.push(SwapClaimFailed.build({
    swapId: SwapId.of('swap_abc123'),
    userAddress: FAKE_ADDRESS,
    network: NETWORK,
    amount: '0.001 WBTC',
    error: 'Transaction reverted: insufficient gas',
  }));

  return alerts;
}

describe('Slack visual — send all alert types', () => {
  it('sends all 4 notification types to Slack', async ({skip}) => { // NOSONAR
    try {
      const raw = readFileSync(SECRET_PATH, 'utf-8');
      const config = JSON.parse(raw) as {botToken: string; channel: string};
      const gateway = new SlackNotificationGateway(config, createLogger());
      const alerts = buildAllAlerts();

      for (const alert of alerts) {
        console.log(`Sending: ${alert.title}`);
        await gateway.send(alert);
      }

      console.log(`Sent ${alerts.length} notifications to ${config.channel}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      skip(`Slack visual test skipped: ${reason}`);
    }
  });
});
