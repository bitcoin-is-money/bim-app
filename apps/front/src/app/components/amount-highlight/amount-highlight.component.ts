import {Component, computed, inject, input} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import type {Amount, Currency} from '../../model';
import {FormatAmountPipe} from '../../pipes/format-amount.pipe';
import {CurrencyService} from '../../services/currency.service';
import {I18nService} from '../../services/i18n.service';

const CRYPTO_CURRENCIES = new Set<Currency>(['BTC', 'SAT']);

@Component({
  selector: 'app-amount-highlight',
  standalone: true,
  imports: [FormatAmountPipe, TranslateModule],
  templateUrl: './amount-highlight.component.html',
  styleUrl: './amount-highlight.component.scss',
})
export class AmountHighlightComponent {

  private readonly currencyService = inject(CurrencyService);
  private readonly i18nService = inject(I18nService);

  readonly originalAmount = input<Amount | undefined>(undefined);
  readonly labelKey = input<string>('home.totalBalance');

  readonly displayedAmount = computed(() => {
    const amount = this.originalAmount();
    if (amount === undefined) return undefined;
    return this.currencyService.convert(amount, this.currencyService.currentCurrency());
  });

  readonly fxSecondary = computed(() => {
    const amount = this.displayedAmount();
    if (amount === undefined) return undefined;
    const target = this.secondaryCurrency(amount.currency);
    if (target === undefined || target === amount.currency) return undefined;
    const converted = this.currencyService.convert(amount, target);
    if (converted.value === amount.value && target !== amount.currency) return undefined;
    return `${converted.format(this.i18nService.currentLocale())} ${target}`;
  });

  private secondaryCurrency(primary: Currency): Currency | undefined {
    if (CRYPTO_CURRENCIES.has(primary)) {
      const fiat = this.currencyService.preferredCurrencies().find(c => !CRYPTO_CURRENCIES.has(c));
      return fiat;
    }
    return 'BTC';
  }
}
