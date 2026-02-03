import {Component, computed, effect, inject, input, model, signal} from '@angular/core';
import {Amount} from '../../model';
import {CurrencyService} from '../../services/currency.service';
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
  private readonly currencyService = inject(CurrencyService);

  readonly amount = model<Amount>(Amount.zero());
  readonly editable = input(false);
  readonly label = input<string | undefined>();
  readonly currencyToggle = input(false);

  private editing = false;
  readonly displayValue = signal('');

  readonly displayCurrency = computed(() =>
    this.currencyToggle()
      ? this.currencyService.currentCurrency()
      : this.amount().currency
  );

  readonly formattedAmount = computed(() => {
    const currency = this.displayCurrency();
    const converted = this.currencyService.convert(this.amount(), currency);
    if (currency === 'BTC')
      return converted.value.toFixed(8);
    if (currency === 'USD')
      return converted.value.toFixed(2);
    return String(Math.round(converted.value));
  });

  constructor() {
    effect(() => {
      const formatted = this.formattedAmount();
      if (!this.editing) {
        this.displayValue.set(formatted);
      }
    });
  }

  readonly sanitizeNumber = (value: string): string => {
    let sanitized = value.replaceAll(/[^\d.]/g, '');
    const dotIndex = sanitized.indexOf('.');
    if (dotIndex !== -1) {
      sanitized = sanitized.slice(0, dotIndex + 1) + sanitized
        .slice(dotIndex + 1)
        .replaceAll('.', '');
    }
    return sanitized;
  };

  onValueChange(value: string): void {
    this.editing = true;
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      this.amount.set(Amount.of(0, this.amount().currency));
    } else {
      const displayAmount = Amount.of(parsed, this.displayCurrency());
      const modelAmount = this.currencyService.convert(displayAmount, this.amount().currency);
      this.amount.set(modelAmount);
    }
  }

  onBlur(): void {
    this.editing = false;
    this.displayValue.set(this.formattedAmount());
  }
}
