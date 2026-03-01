
// =============================================================================
// GET /api/user/settings
// =============================================================================

export interface GetSettingsResponse {
  language: string;
  preferredCurrencies: string[];
  defaultCurrency: string;
}

// =============================================================================
// PUT /api/user/settings
// =============================================================================

export interface UpdateSettingsResponse {
  language: string;
  preferredCurrencies: string[];
  defaultCurrency: string;
}
