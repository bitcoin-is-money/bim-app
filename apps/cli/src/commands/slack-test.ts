import {StarknetAddress} from '@bim/domain/account';
import type {HealthTransitionEvent} from '@bim/domain/health';
import {
  ActivityReport,
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

interface TestMessageBuilder {
  readonly key: string;
  readonly description: string;
  readonly build: () => NotificationMessage;
}

const FAKE_ADDRESS = StarknetAddress.of('0x0035b338c3fc75337e2e68a6f386ad95ad6edd1348b670dd9e8deb9f7a973fcb');

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) {
    throw new Error(`Test fixture "${key}" did not produce a message (check thresholds)`);
  }
  return value;
}

function buildHealthDown(): NotificationMessage {
  const now = new Date();
  const event: HealthTransitionEvent = {
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
  return ServiceHealthChange.fromEvent(event);
}

function buildHealthRecovered(): NotificationMessage {
  const now = new Date();
  const event: HealthTransitionEvent = {
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
  return ServiceHealthChange.fromEvent(event);
}

function buildActivityReport(): NotificationMessage {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return ActivityReport.build({
    network: 'mainnet',
    totalUsers: 1_284,
    totalTransactions: 57_931,
    newUsers: 42,
    newTransactions: 1_337,
    periodStart,
    periodEnd,
  });
}

const TEST_MESSAGES: readonly TestMessageBuilder[] = [
  {
    key: 'avnu-balance-low',
    description: 'AVNU paymaster credits below threshold',
    build: () => required(
      AvnuBalanceLow.evaluate({
        network: 'mainnet',
        currentBalance: 2_300_000_000_000_000_000n,
        threshold: 5_000_000_000_000_000_000n,
      }),
      'avnu-balance-low',
    ),
  },
  {
    key: 'treasury-balance-low',
    description: 'BIM treasury STRK/WBTC balance below threshold',
    build: () => required(
      TreasuryBalanceLow.evaluate({
        address: FAKE_ADDRESS,
        network: 'mainnet',
        strkBalance: 500_000_000_000_000_000n,
        wbtcBalance: 5_000n,
        strkThreshold: 100n * 10n ** 18n,
        wbtcThreshold: 10_000n,
      }),
      'treasury-balance-low',
    ),
  },
  {
    key: 'avnu-credits-recharged',
    description: 'AVNU paymaster credits topped up',
    build: () => required(
      AvnuCreditsRecharged.evaluate({
        address: FAKE_ADDRESS,
        network: 'mainnet',
        previousBalance: 2_300_000_000_000_000_000n,
        currentBalance: 50_000_000_000_000_000_000n,
      }),
      'avnu-credits-recharged',
    ),
  },
  {
    key: 'swap-claim-failed',
    description: 'Swap auto-claim failed on-chain',
    build: () => SwapClaimFailed.build({
      swapId: 'swap_test_123' as SwapId,
      userAddress: FAKE_ADDRESS,
      network: 'mainnet',
      amount: '0.001 WBTC',
      error: 'Transaction reverted: insufficient gas',
    }),
  },
  {
    key: 'health-down',
    description: 'Component health transition: healthy → down',
    build: buildHealthDown,
  },
  {
    key: 'health-recovered',
    description: 'Component health transition: down → healthy',
    build: buildHealthRecovered,
  },
  {
    key: 'activity-report',
    description: 'BIM usage KPIs (users & transactions)',
    build: buildActivityReport,
  },
];

function printAvailable(): void {
  console.log('Available test messages:');
  const keyWidth = Math.max(...TEST_MESSAGES.map(m => m.key.length));
  for (const msg of TEST_MESSAGES) {
    console.log(`  ${msg.key.padEnd(keyWidth)}  ${msg.description}`);
  }
  console.log('\nUsage:');
  console.log('  ./bim slack:test              Send all test messages');
  console.log('  ./bim slack:test <key>        Send only the named test message');
  console.log('  ./bim slack:test list         List available keys');
}

export async function run(args: string[]): Promise<void> {
  const selector = args[0];

  if (selector === 'list' || selector === '--list' || selector === 'help' || selector === '--help') {
    printAvailable();
    return;
  }

  let selected: readonly TestMessageBuilder[];
  if (selector === undefined) {
    selected = TEST_MESSAGES;
  } else {
    const match = TEST_MESSAGES.find(m => m.key === selector);
    if (!match) {
      console.error(`Unknown test message: "${selector}"\n`);
      printAvailable();
      process.exit(1);
    }
    selected = [match];
  }

  const secrets = loadSecrets();
  const slack = requireSlack(secrets);
  const logger = createLogger('silent');
  const gateway: NotificationGateway = new SlackNotificationGateway(slack, logger);

  const messages = selected.map(entry => ({...entry.build(), channel: '#tmp'}));

  for (const msg of messages) {
    console.log(`Sending ${msg.severity}: ${msg.title}...`);
    await gateway.send(msg);
    console.log('  Sent.');
  }

  console.log(`\nAll ${messages.length} test message${messages.length === 1 ? '' : 's'} sent.`);
}
