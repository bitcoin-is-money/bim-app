import type {NotificationGateway, NotificationMessage} from '../ports/index.js';
import type {Logger} from 'pino';

/**
 * No-op implementation of NotificationGateway.
 *
 * Used when no Slack bot token is configured (local dev, tests). Incoming
 * messages are logged at debug level so they remain observable, but nothing
 * is sent to any external channel.
 */
export class NoopNotificationGateway implements NotificationGateway {
  private readonly log: Logger;

  constructor(rootLogger: Logger) {
    this.log = rootLogger.child({name: 'noop-notification.gateway.ts'});
  }

  async send(message: NotificationMessage): Promise<void> {
    this.log.debug(
      {severity: message.severity, title: message.title, channel: message.channel},
      'Notification suppressed (no Slack bot token configured)',
    );
  }
}
