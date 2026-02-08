import {inject, Injectable, signal} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {firstValueFrom} from 'rxjs';
import {ApiErrorBody} from '../model';
import {I18nHttpService, Language} from './i18n.http.service';

const SUPPORTED_LANGS: readonly Language[] = ['en', 'fr'] as const;
const DEFAULT_LANG: Language = 'en';

@Injectable({providedIn: 'root'})
export class I18nService {
  private readonly translate = inject(TranslateService);
  private readonly httpService = inject(I18nHttpService);

  private readonly _currentLang = signal<Language>(DEFAULT_LANG);
  readonly currentLang = this._currentLang.asReadonly();
  readonly supportedLangs = SUPPORTED_LANGS;

  constructor() {
    this.translate.setDefaultLang(DEFAULT_LANG);
    this.translate.addLangs([...SUPPORTED_LANGS]);
  }

  /**
   * Initialize i18n with user's saved language preference.
   * Call this after user is authenticated.
   */
  async init(): Promise<void> {
    try {
      const settings = await firstValueFrom(this.httpService.getSettings());
      await this.applyLang(settings.language ?? DEFAULT_LANG);
    } catch {
      // Use browser language as fallback
      const browserLang = this.translate.getBrowserLang() as Language | undefined;
      const lang = browserLang && SUPPORTED_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG;
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
      await firstValueFrom(this.httpService.updateSettings({language: lang}));
    } catch {
      // Language is already applied locally, ignore server error
      console.warn('Failed to persist language preference');
    }
  }

  /**
   * Translate a key with optional parameters.
   */
  t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  /**
   * Translate an API error using its code and args.
   */
  translateError(error: ApiErrorBody): string {
    const key = `errors.${error.code}`;
    const translated = this.translate.instant(key, error.args ?? {});
    // Fallback to backend message if key not found
    return translated === key ? error.message : translated;
  }

  private async applyLang(lang: Language): Promise<void> {
    await firstValueFrom(this.translate.use(lang));
    this._currentLang.set(lang);
  }
}
