import {HttpClient} from '@angular/common/http';
import {effect, inject, Injectable, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {I18nService} from '../../services/i18n.service';
import type {Language} from '../../services/user-settings-http.service';
import type {FaqSection} from './faq-content.parser';
import {parseFaqMarkdown} from './faq-content.parser';

/**
 * Loads the FAQ markdown file matching the current UI language, parses
 * it, and exposes the result as a signal. Results are cached per
 * language so switching back and forth does not re-fetch.
 */
@Injectable({providedIn: 'root'})
export class FaqContentService {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);

  private readonly cache = new Map<Language, FaqSection[]>();
  private readonly _sections = signal<FaqSection[] | undefined>(undefined);

  /** Parsed FAQ sections for the current language, or `undefined` while loading. */
  readonly sections = this._sections.asReadonly();

  constructor() {
    effect(() => {
      const lang = this.i18n.currentLang();
      void this.load(lang);
    });
  }

  private async load(lang: Language): Promise<void> {
    const cached = this.cache.get(lang);
    if (cached !== undefined) {
      this._sections.set(cached);
      return;
    }
    this._sections.set(undefined);
    try {
      const url = `./assets/i18n/faq.${lang}.md`;
      const raw = await firstValueFrom(this.http.get(url, {responseType: 'text'}));
      const parsed = parseFaqMarkdown(raw);
      this.cache.set(lang, parsed);
      this._sections.set(parsed);
    } catch (err: unknown) {
      console.error('Failed to load FAQ content', err);
      this._sections.set([]);
    }
  }
}
