import {UnsupportedLanguageError} from './errors';

/**
 * Language code (ISO 639-1).
 */
export type Language = string & {readonly __brand: 'Language'};

export namespace Language {
  const SUPPORTED_LANGUAGES = new Set(['en', 'fr']);

  export const DEFAULT: Language = 'en' as Language;

  export function of(value: string): Language {
    const normalized = value.trim().toLowerCase();
    if (!SUPPORTED_LANGUAGES.has(normalized)) {
      throw new UnsupportedLanguageError(value, [...SUPPORTED_LANGUAGES]);
    }
    return normalized as Language;
  }

  export function isSupported(value: string): boolean {
    return SUPPORTED_LANGUAGES.has(value.trim().toLowerCase());
  }

  export function getSupportedLanguages(): readonly string[] {
    return [...SUPPORTED_LANGUAGES].sort((a, b) => a.localeCompare(b));
  }
}

