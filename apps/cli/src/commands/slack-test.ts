import {StarknetAddress} from '@bim/domain/account';
import type {HealthTransitionEvent} from '@bim/domain/health';
import {
  AvnuBalanceLow,
  AvnuCreditsRecharged,
  ServiceHealthChange,
  SwapClaimFailed,
  TreasuryBalanceLow,
} from '@bim/domain/notifications';
import type {NotificationGateway, NotificationMessage} from '@bim/domain/ports';
import type {SwapId} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {SlackNotificationGateway} from '@bim/slack';
import {loadSecrets, requireSlack} from '../config/secrets.js';

function buildTestMessages(): NotificationMessage[] {
  const fakeAddress = StarknetAddress.of('0x0035b338c3fc75337e2e68a6f386ad95ad6edd1348b670dd9e8deb9f7a973fcb');

  const messages: NotificationMessage[] = [];

  // AvnuBalanceLow — force trigger by setting balance below threshold
  const avnuLow = AvnuBalanceLow.evaluate({
    network: 'mainnet',
    currentBalance: 2_300_000_000_000_000_000n,
    threshold: 5_000_000_000_000_000_000n,
  });
  if (avnuLow) messages.push(avnuLow);

  // TreasuryBalanceLow — force trigger
  const treasuryLow = TreasuryBalanceLow.evaluate({
    address: fakeAddress,
    network: 'mainnet',
    currentBalance: 500_000_000_000_000_000n,
    threshold: 2_000_000_000_000_000_000n,
  });
  if (treasuryLow) messages.push(treasuryLow);

  // AvnuCreditsRecharged — force trigger with increased balance
  const recharged = AvnuCreditsRecharged.evaluate({
    address: fakeAddress,
    network: 'mainnet',
    previousBalance: 2_300_000_000_000_000_000n,
    currentBalance: 50_000_000_000_000_000_000n,
  });
  if (recharged) messages.push(recharged);

  // SwapClaimFailed — always produces a message
  messages.push(SwapClaimFailed.build({
    swapId: 'swap_test_123' as SwapId,
    userAddress: fakeAddress,
    network: 'mainnet',
    amount: '0.001 WBTC',
    error: 'Transaction reverted: insufficient gas',
  }));

  // ServiceHealthChange — component down
  const now = new Date();
  const downEvent: HealthTransitionEvent = {
    component: 'atomiq',
    from: 'healthy',
    to: 'down',
    error: {kind: 'network', summary: 'Connection refused (ECONNREFUSED)'},
    downtimeMs: undefined,
    snapshot: {
      overall: 'degraded',
      components: [
        {name: 'atomiq', status: 'down', lastError: {kind: 'network', summary: 'ECONNREFUSED'}, lastHealthyAt: now, downSince: now, lastCheckAt: now},
        {name: 'database', status: 'healthy', lastError: undefined, lastHealthyAt: now, downSince: undefined, lastCheckAt: now},
      ],
      updatedAt: now,
    },
  };
  messages.push(ServiceHealthChange.fromEvent(downEvent));

  // ServiceHealthChange — component recovered
  const recoveredEvent: HealthTransitionEvent = {
    component: 'atomiq',
    from: 'down',
    to: 'healthy',
    error: undefined,
    downtimeMs: 342_000,
    snapshot: {
      overall: 'healthy',
      components: [
        {name: 'atomiq', status: 'healthy', lastError: undefined, lastHealthyAt: now, downSince: undefined, lastCheckAt: now},
        {name: 'database', status: 'healthy', lastError: undefined, lastHealthyAt: now, downSince: undefined, lastCheckAt: now},
      ],
      updatedAt: now,
    },
  };
  messages.push(ServiceHealthChange.fromEvent(recoveredEvent));

  return messages;
}

export async function run(_args: string[]): Promise<void> {
  const secrets = loadSecrets();
  const slack = requireSlack(secrets);
  const logger = createLogger('silent');
  const gateway: NotificationGateway = new SlackNotificationGateway(slack, logger);

  const messages = buildTestMessages().map(msg => ({...msg, channel: '#tmp'}));

  for (const msg of messages) {
    console.log(`Sending ${msg.severity}: ${msg.title}...`);
    await gateway.send(msg);
    console.log('  Sent.');
  }

  console.log(`\nAll ${messages.length} test messages sent.`);
}
