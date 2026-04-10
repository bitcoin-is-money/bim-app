import {StarknetAddress} from '@bim/domain/account';
import {HealthRegistry} from '@bim/domain/health';
import {createLogger} from '@bim/lib/logger';
import {type AvnuSwapConfig, AvnuSwapGateway} from '@bim/starknet';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const logger = createLogger('silent');

const config: AvnuSwapConfig = {
  baseUrl: 'https://sepolia.api.avnu.fi',
  knownTokenAddresses: [StarknetAddress.of('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d')],
};

describe('AvnuSwapGateway.checkHealth', () => {
  let healthRegistry: HealthRegistry;
  let gateway: AvnuSwapGateway;

  beforeEach(() => {
    healthRegistry = new HealthRegistry(['avnu-swap'], () => { /* no-op */ }, logger);
    gateway = new AvnuSwapGateway(config, logger, healthRegistry);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports healthy when the base URL returns any HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not found', {status: 404}));

    await gateway.checkHealth();

    expect(healthRegistry.getState().components.find(c => c.name === 'avnu-swap')?.status).toBe('healthy');
  });

  it('reports down when Cloudflare tunnel returns HTTP 530', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('cloudflare error page', {status: 530}));

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-swap');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.kind).toBe('cloudflare_tunnel');
    expect(comp?.lastError?.httpCode).toBe(530);
  });

  it('reports down on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ENOTFOUND'));

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-swap');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.kind).toBe('network');
  });

  it('reports down on timeout', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('The operation was aborted'));

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'avnu-swap');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.kind).toBe('timeout');
  });
});
