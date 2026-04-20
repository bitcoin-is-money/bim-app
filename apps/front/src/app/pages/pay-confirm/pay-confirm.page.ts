import {CommonModule} from '@angular/common';
import {Component, computed, effect, inject, signal} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';
import {AmountFieldComponent} from '../../components/amount-field/amount-field.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {SlideToConfirmComponent} from '../../components/slide-to-confirm/slide-to-confirm.component';
import {FullPageLayoutComponent} from '../../layout';
import {Amount} from '../../model';
import {AccountService} from '../../services/account.service';
import {CurrencyService} from '../../services/currency.service';
import {I18nService} from '../../services/i18n.service';
import {NotificationService} from '../../services/notification.service';
import {PayService} from '../../services/pay.service';

const ARRIVAL_BY_NETWORK: Record<string, string> = {
  lightning: '< 3 sec',
  starknet: '< 30 sec',
  bitcoin: '~ 10 min',
};

@Component({
  selector: 'app-pay-confirm',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FaIconComponent,
    GoBackHeaderComponent,
    AmountFieldComponent,
    SlideToConfirmComponent,
    FullPageLayoutComponent,
  ],
  templateUrl: './pay-confirm.page.html',
  styleUrl: './pay-confirm.page.scss',
})
export class PayConfirmPage {

  private readonly accountService = inject(AccountService);
  private readonly currencyService = inject(CurrencyService);
  private readonly i18n = inject(I18nService);
  private readonly paymentService = inject(PayService);
  private readonly notificationService = inject(NotificationService);

  readonly payment = this.paymentService.parsedPayment;
  readonly isLoading = this.paymentService.isLoading;
  readonly isBuilding = this.paymentService.isBuilding;
  readonly description = signal('');
  readonly editableAmount = signal<Amount | undefined>(undefined);
  readonly isProcessing = this.paymentService.isProcessing;

  readonly effectiveAmount = computed((): Amount | undefined => {
    const p = this.payment();
    if (!p) return undefined;
    return p.amountEditable ? this.editableAmount() : p.amount;
  });

  readonly primaryAmount = computed((): string => {
    const amount = this.effectiveAmount();
    if (!amount) return '—';
    const displayed = this.currencyService.convert(amount, this.currencyService.currentCurrency());
    return displayed.format(this.i18n.currentLocale());
  });

  readonly currency = computed((): string => {
    return this.currencyService.currentCurrency();
  });

  readonly secondaryAmount = computed((): string | undefined => {
    const amount = this.effectiveAmount();
    if (!amount) return undefined;
    const current = this.currencyService.currentCurrency();
    const target = current === 'BTC' || current === 'SAT' ? 'USD' : 'BTC';
    if (target === current) return undefined;
    const converted = this.currencyService.convert(amount, target);
    return `${converted.format(this.i18n.currentLocale())} ${target}`;
  });

  readonly arrivalEstimate = computed((): string => {
    const p = this.payment();
    if (!p) return '—';
    return ARRIVAL_BY_NETWORK[p.network] ?? '—';
  });

  readonly feeFormatted = computed((): string | undefined => {
    if (this.isBuilding()) return undefined;
    const p = this.payment();
    if (!p) return undefined;
    const fee = this.currencyService.convert(p.fee, this.currencyService.currentCurrency());
    return `${fee.format(this.i18n.currentLocale())} ${this.currencyService.currentCurrency()}`;
  });

  readonly feePercent = computed((): string => {
    const p = this.payment();
    const amount = this.effectiveAmount();
    if (!p || !amount || amount.value === 0) return '—';
    const pct = (p.fee.value / amount.value) * 100;
    if (pct < 0.01) return '< 0.01%';
    return `${pct.toFixed(2)}%`;
  });

  readonly paymentAvailable = computed((): boolean => {
    const p = this.payment();
    if (!p) return false;
    if (p.amountEditable) {
      const amount = this.editableAmount();
      return amount !== undefined && amount.value > 0;
    }
    if (this.isBuilding()) return false;
    const balance = this.accountService.balance();
    if (!balance) return false;
    return balance.value >= p.amount.value + p.fee.value;
  });

  constructor() {
    effect(() => {
      const p = this.payment();
      if (p) {
        this.description.set(p.description);
        if (p.amountEditable) {
          this.editableAmount.set(Amount.zero());
        }
      }
    });
  }

  onAmountChange(amount: Amount | undefined): void {
    this.editableAmount.set(amount);
    const p = this.payment();
    if (amount && p) {
      const satAmount = this.currencyService.convert(amount, 'SAT');
      this.paymentService.updatePaymentAmount(p.destination, Math.round(satAmount.value));
    }
  }

  confirm(): void {
    if (!this.paymentAvailable()) {
      this.notificationService.error({message: this.i18n.t('payConfirm.insufficientBalance')});
      return;
    }
    void this.paymentService.executeAndNavigate();
  }
}
