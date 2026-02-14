import {CommonModule} from '@angular/common';
import {Component, computed, inject, signal} from '@angular/core';
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
  description = signal('');

  computedFee = computed((): Amount | undefined => {
    const p = this.payment();
    if (!p) return undefined;
    return this.currencyService.convert(p.fee, this.currencyService.currentCurrency());
  });

  paymentAvailable = computed((): boolean => {
    const balance = this.accountService.balance();
    const p = this.payment();
    if (!balance || !p) {
      return false;
    }
    const result: boolean = balance.value >= p.amount.value + p.fee.value;
    if (!result) {
      console.log('Insufficient balance', balance, p);
      this.notificationService.error({message: this.i18n.t('payConfirm.insufficientBalance')});
    }
    return result;
  });

  readonly isProcessing = this.paymentService.isProcessing;

  constructor() {
    const p = this.payment();
    if (p) {
      this.description.set(p.description);
    }
  }

  onDescriptionChange(value: string): void {
    this.description.set(value);
    this.paymentService.setDescription(value);
  }

  confirm(): void {
    this.paymentService.executeAndNavigate();
  }
}
