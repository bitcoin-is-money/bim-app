import {Component, computed, input, model} from '@angular/core';
import {Amount} from '../../model';
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
  readonly amount = model<Amount>(Amount.zero());
  readonly editable = input(false);
  readonly label = input<string | undefined>();
  readonly currencyToggle = input(false);

  readonly formattedAmount = computed(() => {
    const { value, currency } = this.amount();
    if (currency === 'BTC') return value.toFixed(8);
    if (currency === 'USD') return value.toFixed(2);
    return String(Math.round(value));
  });

  onValueChange(value: string): void {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      this.amount.set(Amount.of(parsed, this.amount().currency));
    }
  }
}
