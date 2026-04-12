import type {NotificationGateway, NotificationMessage, NotificationSeverity} from '@bim/domain/ports';
import {ExternalServiceError} from '@bim/domain/shared';
import type {Logger} from 'pino';
import type {AnyMessageBlock, MessageAttachment} from 'slack-web-api-client';
import {SlackAPIClient} from 'slack-web-api-client';

export interface SlackNotificationConfig {
  readonly botToken: string;
}

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  alert: '#FFA500',
  error: '#DC3545',
  info: '#2196F3',
};

const ICON_WARNING = '⚠️';
const ICON_ERROR = '🚨';
const ICON_INFO = 'ℹ️';

const SEVERITY_ICONS: Record<NotificationSeverity, string> = {
  alert: ICON_WARNING,
  error: ICON_ERROR,
  info: ICON_INFO,
};

export class SlackNotificationGateway implements NotificationGateway {
  private readonly log: Logger;
  private readonly client: SlackAPIClient;

  constructor(
    config: SlackNotificationConfig,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: 'slack-notification.gateway.ts'});
    this.client = new SlackAPIClient(config.botToken);
  }

  async send(message: NotificationMessage): Promise<void> {
    const icon = SEVERITY_ICONS[message.severity];
    const color = SEVERITY_COLORS[message.severity];

    // Split the description on blank lines so each paragraph lands in its
    // own `section` block. Slack collapses tall single-section blocks behind
    // a "See more" link; multiple shorter blocks render in full.
    const descriptionChunks = message.description
      .split(/\n{2,}/)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 0);

    const blocks: AnyMessageBlock[] = descriptionChunks.map(chunk => ({
      type: 'section',
      text: {type: 'mrkdwn', text: chunk},
    }));

    if (message.fields.size > 0) {
      const fields: {type: 'mrkdwn'; text: string}[] = [];
      for (const [key, value] of message.fields) {
        fields.push({type: 'mrkdwn', text: `*${key}*\n${value}`});
      }
      blocks.push({type: 'section', fields});
    }

    if (message.links && message.links.length > 0) {
      const elements = message.links.map(link => ({
        type: 'button' as const,
        text: {type: 'plain_text' as const, text: link.label},
        url: link.url,
        action_id: `link-${link.label.toLowerCase().replaceAll(' ', '-')}`,
      }));
      blocks.push({type: 'actions', elements});
    }

    if (message.context) {
      const contextLine = `:calendar: ${new Date().toISOString()} • ${message.context}`;
      blocks.push({
        type: 'context',
        elements: [{type: 'mrkdwn', text: contextLine}],
      });
    }

    const attachment: MessageAttachment = {color, blocks};

    try {
      this.log.info({severity: message.severity, title: message.title}, 'Sending Slack notification');

      await this.client.chat.postMessage({
        channel: message.channel,
        text: `${icon} ${message.title}`,
        attachments: [attachment],
      });
    } catch (error) {
      throw new ExternalServiceError(
        'Slack',
        `Failed to send notification: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
    }
  }
}
