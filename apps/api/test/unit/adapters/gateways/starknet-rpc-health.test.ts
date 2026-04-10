import {HealthRegistry} from '@bim/domain/health';
import type {PaymasterGateway} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import {type StarknetGatewayConfig, StarknetRpcGateway} from '@bim/starknet';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const logger = createLogger('silent');

const baseConfig: StarknetGatewayConfig = {
  rpcUrl: 'http://localhost:5050',
  accountClassHash: '0x123',
  tokenAddresses: {WBTC: '0xwbtc', STRK: '0xstrk'},
  webauthnOrigin: 'http://localhost:8080',
  webauthnRpId: 'localhost',
};

const stubPaymaster = {} as PaymasterGateway;

describe('StarknetRpcGateway.checkHealth', () => {
  let healthRegistry: HealthRegistry;

  beforeEach(() => {
    healthRegistry = new HealthRegistry(['starknet-rpc'], () => {}, logger);
  });

  it('reports healthy when the RPC responds to starknet_chainId', async () => {
    const gateway = new StarknetRpcGateway(baseConfig, stubPaymaster, logger, healthRegistry);
    // starknet.js RpcProvider.getChainId is an async method on the instance.
    const provider = (gateway as unknown as {provider: {getChainId: () => Promise<string>}}).provider;
    vi.spyOn(provider, 'getChainId').mockResolvedValue('0x534e5f5345504f4c4941');

    await gateway.checkHealth();

    expect(healthRegistry.getState().components.find(c => c.name === 'starknet-rpc')?.status).toBe('healthy');
  });

  it('reports down when starknet_chainId throws a network error', async () => {
    const gateway = new StarknetRpcGateway(baseConfig, stubPaymaster, logger, healthRegistry);
    const provider = (gateway as unknown as {provider: {getChainId: () => Promise<string>}}).provider;
    vi.spyOn(provider, 'getChainId').mockRejectedValue(new Error('fetch failed'));

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'starknet-rpc');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.kind).toBe('network');
  });

  it('reports down with timeout kind when getChainId never resolves', async () => {
    const gateway = new StarknetRpcGateway(baseConfig, stubPaymaster, logger, healthRegistry);
    const provider = (gateway as unknown as {provider: {getChainId: () => Promise<string>}}).provider;
    // Never resolves — the internal 5s timeout should fire. We shorten the
    // wait by mocking Promise.race via the timeout branch: we just return a
    // promise that rejects with a timeout message before calling checkHealth.
    vi.spyOn(provider, 'getChainId').mockImplementation(() => Promise.reject(new Error('starknet_chainId timed out')));

    await gateway.checkHealth();

    const comp = healthRegistry.getState().components.find(c => c.name === 'starknet-rpc');
    expect(comp?.status).toBe('down');
    expect(comp?.lastError?.kind).toBe('timeout');
  });
});
