import {SlackAPIClient} from 'slack-web-api-client';
import type {AnyMessageBlock, MessageAttachment} from 'slack-web-api-client';
import {loadSecrets, requireSlack} from '../config/secrets.js';

type Severity = 'alert' | 'error' | 'info';

const COLORS: Record<Severity, string> = {
  alert: '#FFA500',
  error: '#DC3545',
  info: '#2196F3',
};

const ICONS: Record<Severity, string> = {
  alert: '\u26A0\uFE0F',
  error: '\uD83D\uDEA8',
  info: '\u2139\uFE0F',
};

interface TestMessage {
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly fields: Record<string, string>;
  readonly links?: readonly {readonly label: string; readonly url: string}[];
  readonly context: string;
}

function buildBlocks(msg: TestMessage): AnyMessageBlock[] {
  const blocks: AnyMessageBlock[] = [
    {type: 'section', text: {type: 'mrkdwn', text: msg.description}},
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
    description: 'The AVNU paymaster account balance is below the configured threshold.',
    fields: {
      'Account': '`0x0269...435f`',
      'Network': 'mainnet',
      'Balance': '2.300000 STRK',
      'Threshold': '5.000000 STRK',
    },
    links: [
      {label: 'AVNU Portal', url: 'https://portal.avnu.fi'},
    ],
    context: `\uD83D\uDCC5 ${new Date().toISOString()} \u2022 bim-monitor \u2022 mainnet`,
  },
  {
    severity: 'error',
    title: 'Swap Claim Failed',
    description: 'A forward swap claim transaction failed. Manual intervention may be required.',
    fields: {
      'Swap ID': '`swap_abc123`',
      'Amount': '0.001 WBTC',
      'Error': 'Transaction reverted: insufficient gas',
    },
    context: `\uD83D\uDCC5 ${new Date().toISOString()} \u2022 bim-monitor \u2022 mainnet`,
  },
  {
    severity: 'info',
    title: 'AVNU Credits Recharged',
    description: 'The AVNU paymaster account has been successfully recharged.',
    fields: {
      'New Balance': '50.000000 STRK',
      'Added': '45.000000 STRK',
    },
    context: `\uD83D\uDCC5 ${new Date().toISOString()} \u2022 bim-monitor \u2022 mainnet`,
  },
];

export async function run(_args: string[]): Promise<void> {
  const secrets = loadSecrets();
  const slack = requireSlack(secrets);
  const client = new SlackAPIClient(slack.botToken);

  for (const msg of TEST_MESSAGES) {
    const icon = ICONS[msg.severity];
    const color = COLORS[msg.severity];
    const blocks = buildBlocks(msg);

    console.log(`Sending ${msg.severity}: ${msg.title}...`);

    await client.chat.postMessage({
      channel: slack.channel,
      text: `${icon} ${msg.title}`,
      attachments: [{color, blocks} satisfies MessageAttachment],
    });

    console.log(`  Sent.`);
  }

  console.log('All 3 test messages sent.');
}
