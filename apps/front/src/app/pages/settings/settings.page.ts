import {Component, computed, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout';
import type {Language} from '../../services/user-settings-http.service';
import {CurrencyService} from '../../services/currency.service';
import {I18nService} from '../../services/i18n.service';

interface LanguageOption {
  code: Language;
  flag: string;
  name: string;
}

const LANGUAGE_OPTIONS: [LanguageOption, ...LanguageOption[]] = [
  {code: 'en', flag: '🇬🇧', name: 'English'},
  {code: 'fr', flag: '🇫🇷', name: 'Français'},
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, TranslateModule, GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly i18n = inject(I18nService);
  private readonly currency = inject(CurrencyService);

  readonly languages = LANGUAGE_OPTIONS;
  readonly currentLanguage = this.i18n.currentLang;
  readonly currentFiat = computed(() => {
    const preferred = this.currency.preferredCurrencies();
    return preferred.find(c => c !== 'BTC' && c !== 'SAT') ?? 'USD';
  });
  readonly currencyOptions = computed(() => {
    const locale = this.i18n.currentLocale();
    const displayNames = new Intl.DisplayNames([locale], {type: 'currency'});
    return this.currency.supportedCurrencies().map(code => ({
      code,
      label: `${displayNames.of(code)} (${code})`,
    }));
  });

  onLanguageChange(lang: Language): void {
    this.i18n.setLang(lang);
  }

  onFiatChange(fiat: string): void {
    this.currency.setPreferredFiat(fiat);
  }

  getSelectedOption(): LanguageOption {
    return LANGUAGE_OPTIONS
      .find(l => l.code === this.currentLanguage()) ?? LANGUAGE_OPTIONS[0];
  }
}
