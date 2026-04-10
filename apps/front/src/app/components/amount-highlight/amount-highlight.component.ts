import {Component, computed, inject, input} from '@angular/core';
import type {Amount} from '../../model';
import {FormatAmountPipe} from '../../pipes/format-amount.pipe';
import {CurrencyService} from '../../services/currency.service';
import {CurrencyDisplayComponent} from '../currency-display/currency-display.component';

@Component({
  selector: 'app-amount-highlight',
  standalone: true,
  imports: [CurrencyDisplayComponent, FormatAmountPipe],
  templateUrl: './amount-highlight.component.html',
  styleUrl: './amount-highlight.component.scss',
})
export class AmountHighlightComponent {

  private readonly currencyService: CurrencyService = inject(CurrencyService);

  /** Original amount with its currency (undefined while loading) */
  readonly originalAmount = input<Amount | undefined>(undefined);

  /** Amount converted to displayed currency, undefined if the original is undefined */
  readonly displayedAmount = computed(() => {
    const amount = this.originalAmount();
    if (amount === undefined)
      return undefined;
    return this.currencyService.convert(amount, this.currencyService.currentCurrency());
  });
}
