
// =============================================================================
// GET /api/currency/prices
// =============================================================================

/**
 * BTC prices for all supported fiat currencies.
 * The keys are the supported currency codes (e.g. "USD", "EUR").
 * The values are the BTC price in that currency.
 */
export type GetPricesResponse = Record<string, number>;
