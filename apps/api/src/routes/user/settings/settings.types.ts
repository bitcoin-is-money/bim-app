
// =============================================================================
// GET /api/user/settings
// =============================================================================

export interface GetSettingsResponse {
  fiatCurrency: string;
  supportedCurrencies: readonly string[];
}

// =============================================================================
// PUT /api/user/settings
// =============================================================================

export interface UpdateSettingsResponse {
  fiatCurrency: string;
  supportedCurrencies: readonly string[];
}
