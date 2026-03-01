import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CoinGeckoPriceGateway} from '../../../../src/adapters';
import {FiatCurrency} from '@bim/domain/currency';
import {ExternalServiceError} from '@bim/domain/shared';
import {createLogger} from '@bim/lib/logger';

describe('CoinGeckoPriceGateway', () => {
  let gateway: CoinGeckoPriceGateway;
  const usd = FiatCurrency.of('USD');
  const eur = FiatCurrency.of('EUR');

  beforeEach(() => {
    gateway = new CoinGeckoPriceGateway(createLogger('silent'));
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
});
