import {HttpClient} from '@angular/common/http';
import {effect, inject, Injectable, signal} from '@angular/core';
import {marked} from 'marked';
import {firstValueFrom} from 'rxjs';
import {I18nService} from '../../services/i18n.service';
import type {Language} from '../../services/user-settings-http.service';

/**
 * Loads the About markdown file matching the current UI language,
 * renders it to HTML and exposes the result as a signal. Results are
 * cached per language so switching back and forth does not re-fetch.
 */
@Injectable({providedIn: 'root'})
export class AboutContentService {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);

  private readonly cache = new Map<Language, string>();
  private readonly _html = signal<string | undefined>(undefined);

  readonly html = this._html.asReadonly();

  constructor() {
    effect(() => {
      const lang = this.i18n.currentLang();
      void this.load(lang);
    });
  }

  private async load(lang: Language): Promise<void> {
    const cached = this.cache.get(lang);
    if (cached !== undefined) {
      this._html.set(cached);
      return;
    }
    this._html.set(undefined);
    try {
      const url = `./assets/i18n/about.${lang}.md`;
      const raw = await firstValueFrom(this.http.get(url, {responseType: 'text'}));
      const html = marked.parse(raw, {async: false});
      this.cache.set(lang, html);
      this._html.set(html);
    } catch (err: unknown) {
      console.error('Failed to load About content', err);
      this._html.set('');
    }
  }
}
