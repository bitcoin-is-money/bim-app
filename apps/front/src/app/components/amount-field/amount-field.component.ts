import {Component, computed, input, model} from '@angular/core';
import {Currency} from '../../model';
import {CurrencyDisplayComponent} from '../currency-display/currency-display.component';
import {FieldComponent} from '../field/field.component';

@Component({
  selector: 'app-amount-field',
  standalone: true,
  imports: [FieldComponent, CurrencyDisplayComponent],
  templateUrl: './amount-field.component.html',
  styleUrl: './amount-field.component.scss',
})
export class AmountFieldComponent {
  readonly amount = model<number>(0);
  readonly currency = model<Currency>('SAT');
  readonly editable = input(false);
  readonly label = input<string | undefined>();
  readonly currencyToggle = input(false);

  readonly formattedAmount = computed(() => {
    const val = this.amount();
    const curr = this.currency();
    if (curr === 'BTC') return val.toFixed(8);
    if (curr === 'USD') return val.toFixed(2);
    return String(Math.round(val));
  });

  onValueChange(value: string): void {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      this.amount.set(parsed);
    }
  }

  onCurrencyChange(currency: Currency): void {
    this.currency.set(currency);
  }
}
