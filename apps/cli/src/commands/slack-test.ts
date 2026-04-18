import {StarknetAddress} from '@bim/domain/account';
import type {HealthTransitionEvent} from '@bim/domain/health';
import {
  ActivityReport,
  AvnuBalanceLow,
  AvnuCreditsRecharged,
  InvalidOwnerSignature,
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

// Realistic fixture for invalid-owner-signature alert (no truncation)
const FAKE_INVALID_OWNER_SIG_PARAMS = {
  senderAddress: FAKE_ADDRESS,
  publicKey: '0x04a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
  typedData: {
    types: {
      StarknetDomain: [
        {name: 'name', type: 'shortstring'},
        {name: 'version', type: 'shortstring'},
        {name: 'chainId', type: 'shortstring'},
        {name: 'revision', type: 'shortstring'},
      ],
      OutsideExecution: [
        {name: 'Caller', type: 'ContractAddress'},
        {name: 'Nonce', type: 'felt'},
        {name: 'Execute After', type: 'u128'},
        {name: 'Execute Before', type: 'u128'},
        {name: 'Calls', type: 'Call*'},
      ],
      Call: [
        {name: 'To', type: 'ContractAddress'},
        {name: 'Selector', type: 'selector'},
        {name: 'Calldata', type: 'felt*'},
      ],
    },
    primaryType: 'OutsideExecution',
    domain: {name: 'Account.execute_from_outside', version: '2', chainId: 'SN_MAIN', revision: '1'},
    message: {
      Caller: '0x127021a1b5a52d3174c2ab077c2b043c80369250d29428cee956d76ee51584f',
      Nonce: '0x5eef19434af667be8e455034a0a32671',
      'Execute After': '0x1',
      'Execute Before': '0x69e2afd4',
      Calls: [{
        To: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
        Selector: '0x083afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e',
        Calldata: ['0x0182c8a637d8d8518d5f83bbfce6af77a80020890b40cb8b7d30e72355d40778', '0x64', '0x0'],
      }],
    },
  },
  signature: [
    '1', '0x4',
    '0x1e',
    '0x68', '0x74', '0x74', '0x70', '0x73', '0x3a', '0x2f', '0x2f',
    '0x61', '0x70', '0x70', '0x2e', '0x62', '0x69', '0x74', '0x63',
    '0x6f', '0x69', '0x6e', '0x2d', '0x69', '0x73', '0x2d', '0x6d',
    '0x6f', '0x6e', '0x65', '0x79', '0x2e', '0x63', '0x6f',
    '184950938741104858430551024893879498834', '227925600136498494295498893498893469342',
    '26913471932199284921048244940362303486', '287469234869283649823649823649823649823',
    '0x7', '0x2c', '0x22', '0x63', '0x72', '0x6f', '0x73',
    '0x73', '0x4f', '0x72', '0x69', '0x67', '0x69', '0x6e',
    '0x22', '0x3a', '0x66', '0x61', '0x6c', '0x73', '0x65', '0x7d',
    '0x5', '0x3',
    '120942893489234892348923489234892348923', '289348923489234892348923489234823489234',
    '34892348923489234892348923489234892348', '289348923489348923489234892348923489234',
    '0x1',
  ],
  error: "External service 'AVNU Paymaster' failed: SNIP-29 executeTransaction failed: RPC: paymaster_executeTransaction "
    + 'with params { ... } 156: An error occurred (TRANSACTION_EXECUTION_ERROR): {"execution_error":"execution error '
    + 'Execution error Nested(InnerContractExecutionError { contract_address: 0x18df1f1940a62def9b8efb8b8506352419d439a2363cc154bc102c374cb3339, '
    + String.raw`error: Message(\"(0x617267656e742f6d756c746963616c6c2d6661696c6564 ('argent/multicall-failed'), `
    + String.raw`0x617267656e742f696e76616c69642d6f776e65722d736967 ('argent/invalid-owner-sig'))\") })"}`,
  network: 'mainnet',
};

export const TEST_MESSAGES: readonly TestMessageBuilder[] = [
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
    key: 'invalid-owner-signature',
    description: 'AVNU paymaster rejected with argent/invalid-owner-sig',
    build: () => InvalidOwnerSignature.build(FAKE_INVALID_OWNER_SIG_PARAMS),
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
