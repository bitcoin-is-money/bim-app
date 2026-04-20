import { Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { Amount, Currency } from '../../model';
import { CurrencyService } from '../../services/currency.service';
import { I18nService } from '../../services/i18n.service';
import { CurrencyDisplayComponent } from '../currency-display/currency-display.component';
import { FieldComponent } from '../field/field.component';
import { SpinnerComponent } from '../spinner/spinner.component';

@Component({
  selector: 'app-amount-field',
  standalone: true,
  imports: [FieldComponent, CurrencyDisplayComponent, SpinnerComponent],
  templateUrl: './amount-field.component.html',
  styleUrl: './amount-field.component.scss',
})
export class AmountFieldComponent {
  private readonly currencyService = inject(CurrencyService);
  private readonly i18nService = inject(I18nService);

  readonly amount = model<Amount | undefined>(undefined);
  readonly loading = computed(() => this.amount() === undefined);
  readonly editable = input(false);
  readonly label = input<string | undefined>();

  /**
   * When currencyToggle is true: display an amount with the currency from service
   * Otherwise, display an amount with the currency from the original amount parameter.
   */
  readonly currencyToggle = input(false);

  private editing = false;
  readonly displayValue = signal('');

  readonly displayCurrency = computed(() => {
    const amount = this.amount();
    return this.currencyToggle()
      ? this.currencyService.currentCurrency()
      : (amount?.currency ?? 'SAT');
  });

  readonly formattedAmount = computed(() => {
    const amount = this.amount();
    if (!amount) return '';
    const currency = this.displayCurrency();
    return this.currencyService.convert(amount, currency).format(this.i18nService.currentLocale());
  });

  constructor() {
    effect(() => {
      const formatted = this.formattedAmount();
      if (!this.editing) {
        this.displayValue.set(formatted);
      }
    });
  }

  /** Sanitizes input to allow only digits and a single decimal point, respecting currency decimals */
  readonly sanitizeNumber = (value: string): string => {
    const maxDecimals = Currency.decimals(this.displayCurrency());
    let sanitized = value.replaceAll(/[^\d.]/g, '');
    if (maxDecimals === 0) {
      sanitized = sanitized.replaceAll('.', '');
    } else {
      const dotIndex = sanitized.indexOf('.');
      if (dotIndex !== -1) {
        sanitized =
          sanitized.slice(0, dotIndex + 1) +
          sanitized
            .slice(dotIndex + 1)
            .replaceAll('.', '')
            .slice(0, maxDecimals);
      }
    }
    return sanitized;
  };

  onFocus(event: FocusEvent): void {
    const amount = this.amount();
    if (!amount || !(event.target instanceof HTMLInputElement)) return;
    this.editing = true;
    const displayAmount = this.currencyService.convert(amount, this.displayCurrency());
    if (displayAmount.value === 0) {
      this.displayValue.set('');
    } else {
      this.displayValue.set(displayAmount.format('en-US').replaceAll(',', ''));
    }
  }

  onValueChange(value: string): void {
    const amount = this.amount();
    if (!amount) return;
    this.editing = true;
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      this.amount.set(Amount.of(0, amount.currency));
    } else {
      const displayAmount = Amount.of(parsed, this.displayCurrency());
      const modelAmount = this.currencyService.convert(displayAmount, amount.currency);
      this.amount.set(modelAmount);
    }
  }

  onBlur(): void {
    this.editing = false;
    this.displayValue.set(this.formattedAmount());
  }
}
