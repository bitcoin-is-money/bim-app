
// =============================================================================
// GET /api/currency/prices
// =============================================================================

export interface GetPricesResponse {
  prices: Record<string, number>;
  supportedCurrencies: readonly string[];
}
