
// =============================================================================
// GET /api/user/settings
// =============================================================================

export interface GetSettingsResponse {
  language: string;
  supportedLanguages: readonly string[];
  fiatCurrency: string;
  supportedCurrencies: readonly string[];
}

// =============================================================================
// PUT /api/user/settings
// =============================================================================

export interface UpdateSettingsResponse {
  language: string;
  supportedLanguages: readonly string[];
  fiatCurrency: string;
  supportedCurrencies: readonly string[];
}
