import {DomainError} from '../shared';

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
      throw new UnsupportedLanguageError(value);
    }
    return normalized as Language;
  }

  export function isSupported(value: string): boolean {
    return SUPPORTED_LANGUAGES.has(value.trim().toLowerCase());
  }

  export function getSupportedLanguages(): readonly string[] {
    return [...SUPPORTED_LANGUAGES];
  }
}

export class UnsupportedLanguageError extends DomainError {
  constructor(readonly language: string) {
    super(`Unsupported language: ${language}. Supported: ${Language.getSupportedLanguages().join(', ')}`);
  }
}
