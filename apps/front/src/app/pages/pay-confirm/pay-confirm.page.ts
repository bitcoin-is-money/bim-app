import {CommonModule} from '@angular/common';
import {Component, computed, inject} from '@angular/core';
import {AmountFieldComponent} from '../../components/amount-field/amount-field.component';
import {AmountHighlightComponent} from '../../components/amount-highlight/amount-highlight.component';
import {FieldComponent} from '../../components/field/field.component';
import {ButtonComponent} from '../../components/button/button.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {LogoFooterComponent} from '../../components/logo-footer/logo-footer.component';
import {NetworkLogoComponent} from '../../components/network-logo/network-logo.component';
import {AccountService} from '../../services/account.service';
import {PaymentService} from '../../services/payment.service';

@Component({
  selector: 'app-pay-confirm',
  standalone: true,
  imports: [CommonModule, ButtonComponent, GoBackHeaderComponent, LogoFooterComponent, NetworkLogoComponent, FieldComponent, AmountFieldComponent, AmountHighlightComponent],
  templateUrl: './pay-confirm.page.html',
  styleUrl: './pay-confirm.page.scss',
})
export class PayConfirmPage {

  private readonly accountService = inject(AccountService);
  private readonly paymentService = inject(PaymentService);

  payment = this.paymentService.parsedPayment;

  paymentAvailable = computed(() => {
    const balance = this.accountService.balance();
    const p = this.payment();
    if (!balance || !p) return false;
    return balance.value >= p.amount.value + p.fee.value;
  });

  confirm(): void {
    // TODO: execute payment
  }
}
