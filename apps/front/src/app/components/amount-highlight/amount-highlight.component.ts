import {CommonModule} from '@angular/common';
import {Component, computed, inject, input, signal} from '@angular/core';
import {CurrencyDisplayComponent} from '../currency-display/currency-display.component';
import {Amount, Currency} from '../../model';
import {CurrencyService} from '../../services/currency.service';

@Component({
  selector: 'app-amount-highlight',
  standalone: true,
  imports: [CommonModule, CurrencyDisplayComponent],
  templateUrl: './amount-highlight.component.html',
  styleUrl: './amount-highlight.component.scss',
})
export class AmountHighlightComponent {

  private readonly currencyService: CurrencyService = inject(CurrencyService);

  /** Target currency selected by user */
  private readonly targetCurrency = signal<Currency>('USD');

  /** Original amount with its currency (undefined while loading) */
  readonly originalAmount = input<Amount | undefined>(undefined);

  /** Amount converted to displayed currency, undefined if the original is undefined */
  readonly displayedAmount = computed(() => {
    const amount = this.originalAmount();
    if (amount === undefined)
      return undefined;
    return this.currencyService.convert(amount, this.targetCurrency());
  });

  onCurrencyChange(newCurrency: Currency): void {
    this.targetCurrency.set(newCurrency);
  }
}
