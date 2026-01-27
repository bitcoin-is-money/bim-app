import {CommonModule} from '@angular/common';
import {Component, computed, inject, input, signal} from '@angular/core';
import {CurrencyDisplayComponent} from "../../../../components/currency-display/currency-display.component";
import {Amount, Currency} from "../../../../model";
import {CurrencyService} from "../../../../services/currency.service";

@Component({
  selector: 'app-balance-display',
  standalone: true,
  imports: [CommonModule, CurrencyDisplayComponent],
  templateUrl: './balance-display.component.html',
  styleUrl: './balance-display.component.scss',
})
export class BalanceDisplayComponent {

  private readonly currencyService: CurrencyService = inject(CurrencyService);

  /** Target currency selected by user */
  private readonly targetCurrency = signal<Currency>('USD');

  /** Original amount with its currency */
  readonly originalAmount = input<Amount>(Amount.zero());

  /** Amount converted to displayed currency */
  readonly displayedAmount = computed(() => {
    return this.currencyService.convert(
      this.originalAmount(),
      this.targetCurrency()
    );
  });

  onCurrencyChange(newCurrency: Currency): void {
    this.targetCurrency.set(newCurrency);
  }
}
