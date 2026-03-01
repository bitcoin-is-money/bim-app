import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CurrencyService, FiatCurrency} from '../../src/currency';
import type {PriceGateway} from '../../src/ports';
import {createLogger} from '@bim/lib/logger';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let mockGateway: PriceGateway;

  const usd = FiatCurrency.of('USD');
  const eur = FiatCurrency.of('EUR');

  /** Build a full price map for all supported currencies (gateway returns all) */
  function allPrices(overrides: Partial<Record<string, number>> = {}): Map<FiatCurrency, number> {
    const defaults: Record<string, number> = {
      USD: 95000, EUR: 87000, GBP: 75000, CHF: 84000, JPY: 14000000, CAD: 130000, AUD: 145000,
    };
    const merged = {...defaults, ...overrides};
    const map = new Map<FiatCurrency, number>();
    for (const [k, v] of Object.entries(merged)) {
      map.set(FiatCurrency.of(k), v);
    }
    return map;
  }

  beforeEach(() => {
    mockGateway = {
      getBtcPrices: vi.fn(),
    };
    service = new CurrencyService({
      priceGateway: mockGateway,
      logger: createLogger('silent'),
    });
  });

  it('always fetches all available currencies from gateway', async () => {
    vi.mocked(mockGateway.getBtcPrices).mockResolvedValue(allPrices());

    await service.getBtcPrices([usd]);

    // Gateway should receive ALL supported currencies, not just [usd]
    const calledWith = vi.mocked(mockGateway.getBtcPrices).mock.calls[0]![0];
    expect(calledWith.length).toBe(FiatCurrency.getSupportedCurrencies().length);
  });

  it('returns only requested currencies from the full cache', async () => {
    vi.mocked(mockGateway.getBtcPrices).mockResolvedValue(allPrices());

    const result = await service.getBtcPrices([usd, eur]);

    expect(result.size).toBe(2);
    expect(result.get(usd)).toBe(95000);
    expect(result.get(eur)).toBe(87000);
  });

  it('returns cached prices on second call within TTL', async () => {
    vi.mocked(mockGateway.getBtcPrices).mockResolvedValue(allPrices());

    await service.getBtcPrices([usd, eur]);
    const result = await service.getBtcPrices([usd]);

    expect(result.get(usd)).toBe(95000);
    expect(result.size).toBe(1);
    expect(mockGateway.getBtcPrices).toHaveBeenCalledOnce();
  });

  it('filters cached prices to requested currencies', async () => {
    vi.mocked(mockGateway.getBtcPrices).mockResolvedValue(allPrices());

    await service.getBtcPrices([usd, eur]);
    const result = await service.getBtcPrices([usd]);

    expect(result.size).toBe(1);
    expect(result.get(usd)).toBe(95000);
    expect(result.has(eur)).toBe(false);
  });

  it('re-fetches after cache TTL expires', async () => {
    vi.mocked(mockGateway.getBtcPrices).mockResolvedValue(allPrices());
    await service.getBtcPrices([usd]);

    vi.useFakeTimers();
    vi.advanceTimersByTime(CurrencyService.CACHE_TTL_MS + 1);

    vi.mocked(mockGateway.getBtcPrices).mockResolvedValue(allPrices({USD: 96000}));
    const result = await service.getBtcPrices([usd]);

    expect(result.get(usd)).toBe(96000);
    expect(mockGateway.getBtcPrices).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('returns stale cache on gateway failure', async () => {
    vi.mocked(mockGateway.getBtcPrices).mockResolvedValue(allPrices());
    await service.getBtcPrices([usd]);

    vi.useFakeTimers();
    vi.advanceTimersByTime(CurrencyService.CACHE_TTL_MS + 1);

    vi.mocked(mockGateway.getBtcPrices).mockRejectedValue(new Error('API down'));
    const result = await service.getBtcPrices([usd]);

    expect(result.get(usd)).toBe(95000);
    vi.useRealTimers();
  });

  it('throws when no cache and gateway fails', async () => {
    vi.mocked(mockGateway.getBtcPrices).mockRejectedValue(new Error('API down'));

    await expect(service.getBtcPrices([usd])).rejects.toThrow('No cached BTC prices available');
  });
});
