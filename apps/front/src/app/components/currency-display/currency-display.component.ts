import {Component, inject, input} from '@angular/core';
import type {Currency} from '../../model';
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

  onClick(): void {
    this.currencyService.cycleCurrentCurrency();
  }
}
