import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {HealthRegistry, type HealthTransitionEvent} from '../../src/health';
import type {SanitizedError} from '../../src/shared';

const silentLogger = createLogger('silent');

const sampleError: SanitizedError = {
  kind: 'cloudflare_tunnel',
  httpCode: 530,
  summary: 'Atomiq intermediary unreachable (Cloudflare Tunnel error)',
  originalName: '_RequestError',
};

describe('HealthRegistry', () => {
  let listener: (event: HealthTransitionEvent) => void;
  let registry: HealthRegistry;

  beforeEach(() => {
    listener = vi.fn();
    registry = new HealthRegistry(['atomiq', 'database'], listener, silentLogger);
  });

  it('starts every component in healthy state (optimistic)', () => {
    const snapshot = registry.getState();
    expect(snapshot.overall).toBe('healthy');
    expect(snapshot.components).toHaveLength(2);
    for (const comp of snapshot.components) {
      expect(comp.status).toBe('healthy');
      expect(comp.lastHealthyAt).toBeInstanceOf(Date);
      expect(comp.lastError).toBeUndefined();
    }
  });

  it('does not fire a transition when reporting healthy on a fresh registry', () => {
    registry.reportHealthy('atomiq');
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not re-fire when reporting the same healthy state twice', () => {
    registry.reportHealthy('atomiq');
    registry.reportHealthy('atomiq');
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires a transition when a component goes down', () => {
    registry.reportDown('atomiq', sampleError);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = vi.mocked(listener).mock.calls[0]?.[0];
    expect(event?.from).toBe('healthy');
    expect(event?.to).toBe('down');
    expect(event?.error).toEqual(sampleError);
    expect(event?.snapshot.overall).toBe('degraded');
  });

  it('does not re-fire on repeated down reports', () => {
    registry.reportDown('atomiq', sampleError);
    registry.reportDown('atomiq', sampleError);
    registry.reportDown('atomiq', sampleError);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('computes downtime when recovering from down', async () => {
    registry.reportDown('atomiq', sampleError);
    await new Promise(resolve => setTimeout(resolve, 20));
    vi.mocked(listener).mockClear();

    registry.reportHealthy('atomiq');
    const event = vi.mocked(listener).mock.calls[0]?.[0];
    expect(event?.from).toBe('down');
    expect(event?.to).toBe('healthy');
    expect(event?.downtimeMs).toBeDefined();
    expect(event?.downtimeMs ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('marks overall as degraded when any component is down', () => {
    expect(registry.getState().overall).toBe('healthy');

    registry.reportDown('atomiq', sampleError);
    expect(registry.getState().overall).toBe('degraded');

    registry.reportHealthy('atomiq');
    expect(registry.getState().overall).toBe('healthy');
  });

  it('throws if an unknown component is reported', () => {
    expect(() => registry.reportHealthy('starknet-rpc')).toThrow(/not declared/);
  });

  it('swallows listener exceptions so they do not break callers', () => {
    const throwingListener = vi.fn(() => {
      throw new Error('boom');
    });
    const safeRegistry = new HealthRegistry(['atomiq'], throwingListener, silentLogger);
    expect(() => safeRegistry.reportDown('atomiq', sampleError)).not.toThrow();
    expect(throwingListener).toHaveBeenCalledTimes(1);
  });
});
