import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CoinGeckoPriceGateway} from '../../../../src/adapters';
import {FiatCurrency} from '@bim/domain/currency';
import {HealthRegistry} from '@bim/domain/health';
import {ExternalServiceError} from '@bim/domain/shared';
import {createLogger} from '@bim/lib/logger';

describe('CoinGeckoPriceGateway', () => {
  let gateway: CoinGeckoPriceGateway;
  let healthRegistry: HealthRegistry;
  const usd = FiatCurrency.of('USD');
  const eur = FiatCurrency.of('EUR');

  beforeEach(() => {
    healthRegistry = new HealthRegistry(['coingecko-price'], () => {}, createLogger('silent'));
    gateway = new CoinGeckoPriceGateway(createLogger('silent'), healthRegistry);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches BTC prices for multiple currencies', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({bitcoin: {usd: 95000, eur: 87000}}), {status: 200}),
    );

    const prices = await gateway.getBtcPrices([usd, eur]);

    expect(prices.get(usd)).toBe(95000);
    expect(prices.get(eur)).toBe(87000);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('fetches BTC price for single currency', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({bitcoin: {usd: 95000}}), {status: 200}),
    );

    const prices = await gateway.getBtcPrices([usd]);

    expect(prices.get(usd)).toBe(95000);
    expect(prices.size).toBe(1);
  });

  it('throws ExternalServiceError on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('error', {status: 500, statusText: 'Server Error'}),
    );

    await expect(gateway.getBtcPrices([usd])).rejects.toThrow(ExternalServiceError);
  });

  it('throws ExternalServiceError on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    await expect(gateway.getBtcPrices([usd])).rejects.toThrow(ExternalServiceError);
  });

  it('throws ExternalServiceError on unexpected response format', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({unexpected: 'data'}), {status: 200}),
    );

    await expect(gateway.getBtcPrices([usd])).rejects.toThrow(ExternalServiceError);
  });

  it('rejects zero or negative prices', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({bitcoin: {usd: 0}}), {status: 200}),
    );

    await expect(gateway.getBtcPrices([usd])).rejects.toThrow(ExternalServiceError);
  });

  describe('checkHealth', () => {
    it('reports healthy when /ping returns 200', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('{"gecko_says":"(V3) To the Moon!"}', {status: 200}));

      await gateway.checkHealth();

      const snapshot = healthRegistry.getState();
      const comp = snapshot.components.find(c => c.name === 'coingecko-price');
      expect(comp?.status).toBe('healthy');
    });

    it('reports down when /ping returns non-2xx', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('gateway error', {status: 502}));

      await gateway.checkHealth();

      const comp = healthRegistry.getState().components.find(c => c.name === 'coingecko-price');
      expect(comp?.status).toBe('down');
      expect(comp?.lastError?.httpCode).toBe(502);
    });

    it('reports down on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('fetch failed'));

      await gateway.checkHealth();

      const comp = healthRegistry.getState().components.find(c => c.name === 'coingecko-price');
      expect(comp?.status).toBe('down');
      expect(comp?.lastError?.kind).toBe('network');
    });

    it('reports down with timeout kind on AbortError', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('The operation was aborted'));

      await gateway.checkHealth();

      const comp = healthRegistry.getState().components.find(c => c.name === 'coingecko-price');
      expect(comp?.status).toBe('down');
      expect(comp?.lastError?.kind).toBe('timeout');
    });
  });
});
