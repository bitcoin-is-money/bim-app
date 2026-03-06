import {CommonModule} from '@angular/common';
import {Component, computed, effect, inject, signal} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {AmountFieldComponent} from '../../components/amount-field/amount-field.component';
import {AmountHighlightComponent} from '../../components/amount-highlight/amount-highlight.component';
import {ButtonComponent} from '../../components/button/button.component';
import {FieldComponent} from '../../components/field/field.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {NetworkLogoComponent} from '../../components/network-logo/network-logo.component';
import {FullPageLayoutComponent} from '../../layout';
import {Amount} from "../../model";
import {AccountService} from '../../services/account.service';
import {CurrencyService} from '../../services/currency.service';
import {I18nService} from '../../services/i18n.service';
import {NotificationService} from "../../services/notification.service";
import {PayService} from '../../services/pay.service';

@Component({
  selector: 'app-pay-confirm',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonComponent, GoBackHeaderComponent, NetworkLogoComponent, FieldComponent, AmountFieldComponent, AmountHighlightComponent, FullPageLayoutComponent],
  templateUrl: './pay-confirm.page.html',
  styleUrl: './pay-confirm.page.scss',
})
export class PayConfirmPage {

  private readonly accountService = inject(AccountService);
  private readonly currencyService = inject(CurrencyService);
  private readonly i18n = inject(I18nService);
  private readonly paymentService = inject(PayService);
  private readonly notificationService = inject(NotificationService);

  payment = this.paymentService.parsedPayment;
  readonly isLoading = this.paymentService.isLoading;
  readonly isBuilding = this.paymentService.isBuilding;
  description = signal('');
  editableAmount = signal<Amount | undefined>(undefined);

  computedFee = computed((): Amount | undefined => {
    if (this.isBuilding()) return undefined;
    const p = this.payment();
    if (!p) return undefined;
    return this.currencyService.convert(p.fee, this.currencyService.currentCurrency());
  });

  paymentAvailable = computed((): boolean => {
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

  readonly isProcessing = this.paymentService.isProcessing;

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

  onDescriptionChange(value: string): void {
    this.description.set(value);
    this.paymentService.setDescription(value);
  }

  confirm(): void {
    if (!this.paymentAvailable()) {
      this.notificationService.error({message: this.i18n.t('payConfirm.insufficientBalance')});
      return;
    }
    void this.paymentService.executeAndNavigate();
  }
}
