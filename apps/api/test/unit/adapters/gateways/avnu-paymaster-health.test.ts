import {HealthRegistry} from '@bim/domain/health';
import {createLogger} from '@bim/lib/logger';
import {AvnuPaymasterGateway, type AvnuPaymasterConfig} from '@bim/starknet';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const logger = createLogger('silent');

const baseConfig: AvnuPaymasterConfig = {
  apiUrl: 'https://starknet.paymaster.avnu.fi',
  apiKey: 'test-key',
  sponsorActivityUrl: 'https://starknet.api.avnu.fi/paymaster/v1/sponsor-activity',
};

function oneStrkWei(): bigint {
  return 1_000_000_000_000_000_000n;
}

describe('AvnuPaymasterGateway.checkHealth', () => {
  let healthRegistry: HealthRegistry;
  let gateway: AvnuPaymasterGateway;

  beforeEach(() => {
    healthRegistry = new HealthRegistry(['avnu-paymaster'], () => {}, logger);
    gateway = new AvnuPaymasterGateway(baseConfig, logger, healthRegistry);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports healthy when credits are above threshold', async () => {
    const credits = oneStrkWei() * 100n;
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({remainingStrkCredits: `0x${credits.toString(16)}`}), {status: 200}),
    );

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-paymaster');
    expect(comp?.status).toBe('healthy');
  });

  it('reports healthy when credits equal exactly 1 STRK', async () => {
    const credits = oneStrkWei();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({remainingStrkCredits: `0x${credits.toString(16)}`}), {status: 200}),
    );

    await gateway.checkHealth();

    expect(healthRegistry.getState().components.find(c => c.name === 'avnu-paymaster')?.status).toBe('healthy');
  });

  it('reports down when credits are just below the 1 STRK threshold', async () => {
    const credits = oneStrkWei() - 1n;
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({remainingStrkCredits: `0x${credits.toString(16)}`}), {status: 200}),
    );

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-paymaster');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.summary).toContain('exhausted');
  });

  it('reports down when credits are zero', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({remainingStrkCredits: '0x0'}), {status: 200}),
    );

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-paymaster');
    expect(comp?.status).toBe('down');
  });

  it('reports down when API key is not configured', async () => {
    const noKeyGateway = new AvnuPaymasterGateway(
      {...baseConfig, apiKey: ''},
      logger,
      healthRegistry,
    );

    await noKeyGateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-paymaster');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.summary).toContain('not configured');
  });

  it('reports down when sponsor-activity endpoint returns a 5xx', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('bad gateway', {status: 502}));

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-paymaster');
    expect(comp?.status).toBe('down');
  });

  it('reports down on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fetch failed'));

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-paymaster');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.kind).toBe('network');
  });
});
