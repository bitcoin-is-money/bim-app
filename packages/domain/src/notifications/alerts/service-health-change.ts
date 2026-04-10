import type {ComponentHealth, HealthTransitionEvent} from '../../health';
import type {NotificationMessage} from '../../ports';

const ALERT_CHANNEL = '#alerting';

/**
 * Builds a Slack-friendly notification describing a component health
 * transition (a service went down or recovered after being down).
 *
 * The message always includes a snapshot of every known component so the
 * on-call reader can see the whole system state in one glance.
 */
export class ServiceHealthChange {
  static readonly name = 'service-health-change';

  static fromEvent(event: HealthTransitionEvent): NotificationMessage {
    if (event.to === 'down') {
      return this.buildDownMessage(event);
    }
    return this.buildRecoveredMessage(event);
  }

  private static buildDownMessage(event: HealthTransitionEvent): NotificationMessage {
    const fields = new Map<string, string>([
      ['Component', `\`${event.component}\``],
      ['Transition', `${event.from} → down`],
      ['Overall', event.snapshot.overall],
    ]);

    if (event.error) {
      fields.set('Error kind', event.error.kind);
      if (event.error.httpCode !== undefined) {
        fields.set('HTTP code', String(event.error.httpCode));
      }
      fields.set('Summary', event.error.summary);
    }

    const componentsLine = formatComponentsLine(event.snapshot.components);
    fields.set('All components', componentsLine);

    return {
      channel: ALERT_CHANNEL,
      severity: 'error',
      title: `BIM: ${event.component} is down`,
      description: `Component *${event.component}* transitioned to *down*. App overall status is now *${event.snapshot.overall}*.`,
      fields,
      context: 'bim-health',
    };
  }

  private static buildRecoveredMessage(event: HealthTransitionEvent): NotificationMessage {
    const fields = new Map<string, string>([
      ['Component', `\`${event.component}\``],
      ['Transition', `${event.from} → healthy`],
      ['Overall', event.snapshot.overall],
    ]);

    if (event.downtimeMs !== undefined) {
      fields.set('Downtime', formatDuration(event.downtimeMs));
    }

    fields.set('All components', formatComponentsLine(event.snapshot.components));

    return {
      channel: ALERT_CHANNEL,
      severity: 'info',
      title: `BIM: ${event.component} recovered`,
      description: `Component *${event.component}* is back to *healthy*. App overall status is now *${event.snapshot.overall}*.`,
      fields,
      context: 'bim-health',
    };
  }

}

function formatComponentsLine(components: readonly ComponentHealth[]): string {
  return components
    .map(c => `${iconFor(c.status)} ${c.name}`)
    .join(' • ');
}

function iconFor(status: ComponentHealth['status']): string {
  if (status === 'healthy') return ':large_green_circle:';
  return ':red_circle:';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
