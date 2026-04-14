import type {NotificationMessage} from '@bim/domain/ports';
import {ExternalServiceError} from '@bim/domain/shared';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const postMessage = vi.fn();

vi.mock('slack-web-api-client', () => {
  class SlackAPIClient {
  }
  return {SlackAPIClient};
});

// Import after the mock is set up
const {SlackNotificationGateway} = await import('../src/slack-notification.gateway');

const logger = createLogger('silent');

function message(overrides: Partial<NotificationMessage> = {}): NotificationMessage {
  return {
    channel: '#alerting',
    severity: 'info',
    title: 'Test notification',
    description: 'This is a test',
    fields: new Map(),
    links: [],
    context: 'bim-monitor test',
    ...overrides,
  };
}

describe('SlackNotificationGateway', () => {
  let gateway: InstanceType<typeof SlackNotificationGateway>;

  beforeEach(() => {
    postMessage.mockReset();
    postMessage.mockResolvedValue({ok: true});
    gateway = new SlackNotificationGateway({botToken: 'xoxb-test'}, logger);
  });

  it('sends a minimal notification to the configured channel', async () => {
    await gateway.send(message());

    expect(postMessage).toHaveBeenCalledOnce();
    const call = postMessage.mock.calls[0]?.[0] as {channel: string; text: string};
    expect(call.channel).toBe('#alerting');
    expect(call.text).toContain('Test notification');
  });

  it('prefixes the title with the severity icon', async () => {
    await gateway.send(message({severity: 'error', title: 'Boom'}));
    const call = postMessage.mock.calls[0]?.[0] as {text: string};
    expect(call.text.startsWith('🚨')).toBe(true);

    postMessage.mockClear();
    await gateway.send(message({severity: 'alert', title: 'Low balance'}));
    const call2 = postMessage.mock.calls[0]?.[0] as {text: string};
    expect(call2.text.startsWith('⚠️')).toBe(true);

    postMessage.mockClear();
    await gateway.send(message({severity: 'info', title: 'FYI'}));
    const call3 = postMessage.mock.calls[0]?.[0] as {text: string};
    expect(call3.text.startsWith('ℹ️')).toBe(true);
  });

  it('splits multi-paragraph descriptions into multiple section blocks', async () => {
    await gateway.send(message({description: 'First paragraph.\n\nSecond paragraph.\n\nThird.'}));
    const call = postMessage.mock.calls[0]?.[0] as {attachments: {blocks: {type: string}[]}[]};
    const blocks = call.attachments[0]!.blocks;
    const sectionBlocks = blocks.filter(b => b.type === 'section');
    expect(sectionBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it('adds a section block with fields when the message has fields', async () => {
    const fields = new Map<string, string>([
      ['Key1', 'Value1'],
      ['Key2', 'Value2'],
    ]);
    await gateway.send(message({fields}));
    const call = postMessage.mock.calls[0]?.[0] as {attachments: {blocks: {type: string; fields?: {text: string}[]}[]}[]};
    const fieldBlock = call.attachments[0]!.blocks.find(b => b.fields !== undefined);
    expect(fieldBlock).toBeDefined();
    expect(fieldBlock?.fields?.[0]?.text).toContain('Key1');
  });

  it('adds an actions block with buttons when links are provided', async () => {
    await gateway.send(message({
      links: [
        {label: 'View Details', url: 'https://example.com'},
        {label: 'Portal', url: 'https://portal.example.com'},
      ],
    }));
    const call = postMessage.mock.calls[0]?.[0] as {attachments: {blocks: {type: string; elements?: {action_id: string}[]}[]}[]};
    const actionBlock = call.attachments[0]!.blocks.find(b => b.type === 'actions');
    expect(actionBlock).toBeDefined();
    expect(actionBlock?.elements?.[0]?.action_id).toBe('link-view-details');
    expect(actionBlock?.elements?.[1]?.action_id).toBe('link-portal');
  });

  it('adds a context block with timestamp when context is provided', async () => {
    await gateway.send(message({context: 'bim-monitor sepolia'}));
    const call = postMessage.mock.calls[0]?.[0] as {attachments: {blocks: {type: string; elements?: {text: string}[]}[]}[]};
    const contextBlock = call.attachments[0]!.blocks.find(b => b.type === 'context');
    expect(contextBlock).toBeDefined();
    expect(contextBlock?.elements?.[0]?.text).toContain('bim-monitor sepolia');
  });

  it('colors the attachment based on severity', async () => {
    await gateway.send(message({severity: 'alert'}));
    const call = postMessage.mock.calls[0]?.[0] as {attachments: {color: string}[]};
    expect(call.attachments[0]!.color).toBe('#FFA500');
  });

  it('wraps Slack API failures into ExternalServiceError', async () => {
    postMessage.mockRejectedValue(new Error('invalid_auth'));
    await expect(gateway.send(message())).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('wraps non-Error rejections into ExternalServiceError', async () => {
    postMessage.mockRejectedValue('nope');
    await expect(gateway.send(message())).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
