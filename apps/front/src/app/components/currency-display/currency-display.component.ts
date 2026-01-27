import {Component, inject, input, output} from '@angular/core';
import {Currency} from '../../model';
import {CurrencyService} from '../../services/currency.service';

@Component({
  selector: 'app-currency-display',
  standalone: true,
  templateUrl: './currency-display.component.html',
  styleUrl: './currency-display.component.scss',
})
export class CurrencyDisplayComponent {
  private readonly currencyService = inject(CurrencyService);

  currency = input.required<Currency>();
  size = input<'normal' | 'large'>('normal');

  currencyChange = output<Currency>();

  onClick(): void {
    const currencies = this.currencyService.currencies();
    const currentIndex = currencies.indexOf(this.currency());
    const nextIndex = (currentIndex + 1) % currencies.length;
    const nextCurrency = currencies[nextIndex] as Currency;
    this.currencyChange.emit(nextCurrency);
  }
}
