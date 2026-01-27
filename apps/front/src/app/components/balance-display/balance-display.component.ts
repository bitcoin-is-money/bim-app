import {CommonModule} from '@angular/common';
import {Component, computed, input, signal} from '@angular/core';
import {Amount, Currency} from '../../model';
import {CurrencyService} from '../../services/currency.service';
import {CurrencyDisplayComponent} from '../currency-display/currency-display.component';

@Component({
  selector: 'app-balance-display',
  standalone: true,
  imports: [CommonModule, CurrencyDisplayComponent],
  templateUrl: './balance-display.component.html',
  styleUrl: './balance-display.component.scss',
})
export class BalanceDisplayComponent {
  /** Original amount with its currency */
  originalAmount = input<Amount>(Amount.zero());

  /** Target currency selected by user */
  private readonly targetCurrency = signal<Currency>('USD');

  /** Amount converted to displayed currency */
  displayedAmount = computed(() => {
    return this.currencyService.convert(
      this.originalAmount(),
      this.targetCurrency()
    );
  });

  constructor(
    private readonly currencyService: CurrencyService
  ) {}

  onCurrencyChange(newCurrency: Currency): void {
    this.targetCurrency.set(newCurrency);
  }
}
