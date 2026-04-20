import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { ApiErrorBody } from '../model';
import type { Language } from './user-settings-http.service';
import { UserSettingsHttpService } from './user-settings-http.service';

const SUPPORTED_LANGS: readonly Language[] = ['en', 'fr'] as const;
const DEFAULT_LANG: Language = 'en';
const LANG_STORAGE_KEY = 'bim_lang';

const LANG_TO_LOCALE: Record<Language, string> = {
  en: 'en-US',
  fr: 'fr-FR',
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly translate = inject(TranslateService);
  private readonly httpService = inject(UserSettingsHttpService);

  private readonly _currentLang = signal<Language>(DEFAULT_LANG);
  readonly currentLang = this._currentLang.asReadonly();
  readonly currentLocale = computed(() => LANG_TO_LOCALE[this._currentLang()]);
  readonly supportedLangs = SUPPORTED_LANGS;

  constructor() {
    this.translate.setFallbackLang(DEFAULT_LANG);
    this.translate.addLangs([...SUPPORTED_LANGS]);
  }

  /**
   * Initialize i18n with user's saved language preference.
   * Call this after user is authenticated.
   */
  async init(): Promise<void> {
    try {
      const settings = await firstValueFrom(this.httpService.getSettings());
      await this.applyLang(settings.language);
    } catch {
      // Use browser language as fallback
      const browserLang = this.translate.getBrowserLang() as Language | undefined;
      const lang =
        browserLang && SUPPORTED_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG;
      await this.applyLang(lang);
    }
  }

  /**
   * Initialize with a specific language without fetching from server.
   * Useful for unauthenticated pages.
   */
  async initWithLang(lang: Language): Promise<void> {
    await this.applyLang(lang);
  }

  /**
   * Initialize using browser language preference.
   * Useful for unauthenticated pages.
   */
  async initFromBrowser(): Promise<void> {
    const cached = this.getCachedLang();
    if (cached) {
      await this.applyLang(cached);
      return;
    }
    const browserLang = this.translate.getBrowserLang() as Language | undefined;
    const lang = browserLang && SUPPORTED_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG;
    await this.applyLang(lang);
  }

  /**
   * Change language and persist to server.
   */
  async setLang(lang: Language): Promise<void> {
    await this.applyLang(lang);
    try {
      await firstValueFrom(this.httpService.updateSettings({ language: lang }));
    } catch {
      // Language is already applied locally, ignore server error
      console.warn('Failed to persist language preference');
    }
  }

  /**
   * Translate a key with optional parameters.
   */
  t(key: string, params?: Record<string, unknown>): string {
    return String(this.translate.instant(key, params));
  }

  /**
   * Translate an API error using its code and args.
   */
  translateError(error: ApiErrorBody): string {
    const args = error.args ?? {};
    // Try a more specific key variant when args contain contextual detail
    // e.g. UNSUPPORTED_NETWORK with { network } → try UNSUPPORTED_NETWORK_DETECTED first
    if (args['network'] !== undefined) {
      const detectedKey = `errors.${error.code}_DETECTED`;
      const detectedTranslation = String(this.translate.instant(detectedKey, args));
      if (detectedTranslation !== detectedKey) {
        return detectedTranslation;
      }
    }
    const key = `errors.${error.code}`;
    const translated = String(this.translate.instant(key, args));
    // Fallback to backend message if key not found
    return translated === key ? error.message : translated;
  }

  private getCachedLang(): Language | undefined {
    const cached = localStorage.getItem(LANG_STORAGE_KEY);
    if (cached && SUPPORTED_LANGS.includes(cached as Language)) {
      return cached as Language;
    }
    return undefined;
  }

  private async applyLang(lang: Language): Promise<void> {
    await firstValueFrom(this.translate.use(lang));
    this._currentLang.set(lang);
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }
}
