import {SlackAPIClient} from 'slack-web-api-client';
import type {AnyMessageBlock, MessageAttachment} from 'slack-web-api-client';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// USAGE: npx tsx scripts/admin-account/slack-test.ts
//
// Sends 3 test messages (alert, error, info) to Slack using Block Kit formatting.
// Reads credentials from scripts/admin-account/slack.secret (JSON: { "botToken": "xoxb-...", "channel": "#bim-alerts" })

interface SlackSecret {
  readonly botToken: string;
  readonly channel: string;
}

function loadSecret(): SlackSecret {
  const filePath = join(SCRIPT_DIR, '.slack.secret.json');
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as SlackSecret;
  } catch {
    console.error(`Secret file not found: ${filePath}`);
    console.error('Create it with: { "botToken": "xoxb-...", "channel": "#bim-alerts" }');
    process.exit(1);
  }
}

type Severity = 'alert' | 'error' | 'info';

const COLORS: Record<Severity, string> = {
  alert: '#FFA500',
  error: '#DC3545',
  info: '#2196F3',
};

const ICON_WARNING = '⚠️';
const ICON_ERROR = '🚨';
const ICON_INFO = 'ℹ️';
const ICON_CALENDAR = '📅';
const SEPARATOR = '•';

const ICONS: Record<Severity, string> = {
  alert: ICON_WARNING,
  error: ICON_ERROR,
  info: ICON_INFO,
};

interface TestMessage {
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly fields: Record<string, string>;
  readonly links?: { readonly label: string; readonly url: string }[];
  readonly context: string;
}

function buildBlocks(msg: TestMessage): AnyMessageBlock[] {
  const icon = ICONS[msg.severity];
  const blocks: AnyMessageBlock[] = [
    {
      type: 'section',
      text: {type: 'mrkdwn', text: msg.description},
    },
  ];

  const fieldEntries = Object.entries(msg.fields);
  if (fieldEntries.length > 0) {
    blocks.push({
      type: 'section',
      fields: fieldEntries.map(([key, value]): {type: 'mrkdwn'; text: string} => ({
        type: 'mrkdwn',
        text: `*${key}*\n${value}`,
      })),
    });
  }

  if (msg.links && msg.links.length > 0) {
    blocks.push({
      type: 'actions',
      elements: msg.links.map(link => ({
        type: 'button',
        text: {type: 'plain_text', text: link.label},
        url: link.url,
        action_id: `link-${link.label.toLowerCase().replaceAll(' ', '-')}`,
      })),
    });
  }

  blocks.push({
    type: 'context',
    elements: [{type: 'mrkdwn', text: msg.context}],
  });

  return blocks;
}

const TEST_MESSAGES: readonly TestMessage[] = [
  {
    severity: 'alert',
    title: 'AVNU Balance Low',
    description: 'The AVNU paymaster account balance is below the configured threshold. Please top up credits via the AVNU portal.',
    fields: {
      'Account': '`0x0269...435f`',
      'Network': 'mainnet',
      'Balance': '2.300000 STRK',
      'Threshold': '5.000000 STRK',
    },
    links: [
      {label: 'AVNU Portal', url: 'https://portal.avnu.fi'},
      {label: 'View on Starkscan', url: 'https://starkscan.co/contract/0x02698cf1e909bc26d684182ce66222f5a60588ccc6b455ee4622e3483208435f'},
    ],
    context: `${ICON_CALENDAR} ${new Date().toISOString()} ${SEPARATOR} bim-monitor ${SEPARATOR} mainnet`,
  },
  {
    severity: 'error',
    title: 'Swap Claim Failed',
    description: 'A forward swap claim transaction failed. Manual intervention may be required to recover funds.',
    fields: {
      'Swap ID': '`swap_abc123`',
      'User': '`0x1234...5678`',
      'Amount': '0.001 WBTC',
      'Error': 'Transaction reverted: insufficient gas',
    },
    context: `${ICON_CALENDAR} ${new Date().toISOString()} ${SEPARATOR} bim-monitor ${SEPARATOR} mainnet`,
  },
  {
    severity: 'info',
    title: 'AVNU Credits Recharged',
    description: 'The AVNU paymaster account has been successfully recharged.',
    fields: {
      'Account': '`0x0269...435f`',
      'New Balance': '50.000000 STRK',
      'Added': '45.000000 STRK',
    },
    context: `${ICON_CALENDAR} ${new Date().toISOString()} ${SEPARATOR} bim-monitor ${SEPARATOR} mainnet`,
  },
];

async function main(): Promise<void> {
  const {botToken, channel} = loadSecret();
  const client = new SlackAPIClient(botToken);

  for (const msg of TEST_MESSAGES) {
    const icon = ICONS[msg.severity];
    const color = COLORS[msg.severity];
    const blocks = buildBlocks(msg);

    console.log(`Sending ${msg.severity}: ${msg.title}...`);

    await client.chat.postMessage({
      channel,
      text: `${icon} ${msg.title}`,
      attachments: [{color, blocks} satisfies MessageAttachment],
    });

    console.log(`  Sent.`);
  }

  console.log('All 3 test messages sent.');
}

main().catch((err: unknown) => {
  console.error('Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
