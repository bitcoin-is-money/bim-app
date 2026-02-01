import {CommonModule} from '@angular/common';
import {Component, computed, inject} from '@angular/core';
import {AmountFieldComponent} from '../../../components/amount-field/amount-field.component';
import {AmountHighlightComponent} from '../../../components/amount-highlight/amount-highlight.component';
import {FieldComponent} from '../../../components/field/field.component';
import {Amount, Currency} from '../../../model';
import {ButtonComponent} from '../../../components/button/button.component';
import {GoBackHeaderComponent} from '../../../components/go-back-header/go-back-header.component';
import {LogoFooterComponent} from '../../../components/logo-footer/logo-footer.component';
import {NetworkLogoComponent} from '../../../components/network-logo/network-logo.component';
import {PaymentService} from '../../../services/payment.service';

@Component({
  selector: 'app-pay-confirm',
  standalone: true,
  imports: [CommonModule, ButtonComponent, GoBackHeaderComponent, LogoFooterComponent, NetworkLogoComponent, FieldComponent, AmountFieldComponent, AmountHighlightComponent],
  templateUrl: './pay-confirm.page.html',
  styleUrl: './pay-confirm.page.scss',
})
export class PayConfirmPage {

  private readonly paymentService = inject(PaymentService);
  // private readonly router = inject(Router);

  payment = this.paymentService.parsedPayment;

  amount = computed(() => {
    const p = this.payment();
    if (!p) return undefined;
    return Amount.of(p.amount.value, p.amount.currency as Currency);
  });

  destination = computed(() => {
    const p = this.payment();
    if (!p) return '';
    if (p.network === 'lightning') return p.invoice;
    if (p.network === 'bitcoin') return p.address;
    return p.address;
  });

  shortDestination = computed(() => {
    const dest = this.destination();
    if (dest.length <= 20) return dest;
    return `${dest.slice(0, 20)}...${dest.slice(-10)}`;
  });

  confirm(): void {
    // TODO: execute payment
  }
}
