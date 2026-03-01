import {Language} from "../services/user-settings-http.service";

export interface UserSettings {
  language: Language;
  preferredCurrencies: string[];
  defaultCurrency: string;
}
