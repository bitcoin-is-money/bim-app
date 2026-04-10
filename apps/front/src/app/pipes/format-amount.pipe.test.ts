import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {Amount} from '../model';
import {I18nService} from '../services/i18n.service';
import {FormatAmountPipe} from './format-amount.pipe';

describe('FormatAmountPipe', () => {
  function setup(locale: string) {
    const localeSignal = signal(locale);
    const i18nServiceMock = {currentLocale: localeSignal};

    TestBed.configureTestingModule({
      providers: [
        FormatAmountPipe,
        {provide: I18nService, useValue: i18nServiceMock},
      ],
    });

    return {
      pipe: TestBed.inject(FormatAmountPipe),
      setLocale: (l: string) => { localeSignal.set(l); },
    };
  }

  it('should format with en-US locale', () => {
    const {pipe} = setup('en-US');
    expect(pipe.transform(Amount.of(1234.56, 'USD'))).toBe('1,234.56');
  });

  it('should format with fr-FR locale', () => {
    const {pipe} = setup('fr-FR');
    const result = pipe.transform(Amount.of(1234.56, 'USD'));
    // French: "1 234,56" (with narrow no-break space)
    expect(result).toContain('234');
    expect(result).toContain(',');
    expect(result).toContain('56');
  });
});
