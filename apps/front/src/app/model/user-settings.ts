import {Language} from "../services/i18n.http.service";

export interface UserSettings {
  language: Language;
  supportedLanguages: readonly string[];
  fiatCurrency: string;
  supportedCurrencies: readonly string[];
}
