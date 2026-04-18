import {describe, expect, it} from 'vitest';
import type {HealthTransitionEvent} from '../../src/health/health-registry';
import {ServiceHealthChange} from '../../src/notifications/alerts/service-health-change';
import type {SanitizedError} from '@bim/lib/error';

const atomiqError: SanitizedError = {
  kind: 'cloudflare_tunnel',
  httpCode: 530,
  summary: 'Atomiq intermediary unreachable (Cloudflare Tunnel error)',
};

function makeDownEvent(): HealthTransitionEvent {
  return {
    component: 'atomiq',
    from: 'healthy',
    to: 'down',
    error: atomiqError,
    downtimeMs: undefined,
    snapshot: {
      overall: 'degraded',
      updatedAt: new Date(),
      components: [
        {name: 'atomiq', status: 'down', lastError: atomiqError, lastHealthyAt: undefined, downSince: new Date(), lastCheckAt: new Date()},
        {name: 'database', status: 'healthy', lastError: undefined, lastHealthyAt: new Date(), downSince: undefined, lastCheckAt: new Date()},
      ],
    },
  };
}

function makeRecoveredEvent(): HealthTransitionEvent {
  return {
    component: 'atomiq',
    from: 'down',
    to: 'healthy',
    error: undefined,
    downtimeMs: 125_000,
    snapshot: {
      overall: 'healthy',
      updatedAt: new Date(),
      components: [
        {name: 'atomiq', status: 'healthy', lastError: undefined, lastHealthyAt: new Date(), downSince: undefined, lastCheckAt: new Date()},
        {name: 'database', status: 'healthy', lastError: undefined, lastHealthyAt: new Date(), downSince: undefined, lastCheckAt: new Date()},
      ],
    },
  };
}

describe('ServiceHealthChange', () => {
  it('builds an error-severity message when a component goes down', () => {
    const message = ServiceHealthChange.fromEvent(makeDownEvent());
    expect(message.severity).toBe('error');
    expect(message.title).toContain('atomiq');
    expect(message.title).toContain('down');
    expect(message.channel).toBe('#alerting');
    expect(message.fields.get('HTTP code')).toBe('530');
    expect(message.fields.get('Error kind')).toBe('cloudflare_tunnel');
    expect(message.fields.get('Summary')).toContain('Cloudflare Tunnel');
    expect(message.fields.get('Overall')).toBe('degraded');
  });

  it('does not include raw HTML in any field when error summary is sanitized', () => {
    const message = ServiceHealthChange.fromEvent(makeDownEvent());
    for (const value of message.fields.values()) {
      expect(value).not.toContain('<html');
      expect(value).not.toContain('<!doctype');
    }
    expect(message.description).not.toContain('<html');
  });

  it('builds an info-severity message with formatted downtime when recovering', () => {
    const message = ServiceHealthChange.fromEvent(makeRecoveredEvent());
    expect(message.severity).toBe('info');
    expect(message.title).toContain('recovered');
    expect(message.fields.get('Downtime')).toBe('2m 5s');
    expect(message.fields.get('Overall')).toBe('healthy');
  });
});
