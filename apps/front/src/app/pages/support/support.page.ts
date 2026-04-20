import { Component, computed, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AmountFieldComponent } from '../../components/amount-field/amount-field.component';
import { ButtonComponent } from '../../components/button/button.component';
import { GoBackHeaderComponent } from '../../components/go-back-header/go-back-header.component';
import { FullPageLayoutComponent } from '../../layout';
import { Amount } from '../../model';
import { AccountService } from '../../services/account.service';
import { CurrencyService } from '../../services/currency.service';
import { I18nService } from '../../services/i18n.service';
import { NotificationService } from '../../services/notification.service';
import { PayService } from '../../services/pay.service';

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [
    TranslateModule,
    GoBackHeaderComponent,
    FullPageLayoutComponent,
    AmountFieldComponent,
    ButtonComponent,
  ],
  templateUrl: './support.page.html',
  styleUrl: './support.page.scss',
})
export class SupportPage {
  private readonly accountService = inject(AccountService);
  private readonly currencyService = inject(CurrencyService);
  private readonly payService = inject(PayService);
  private readonly notificationService = inject(NotificationService);
  private readonly i18n = inject(I18nService);

  readonly amount = signal<Amount | undefined>(Amount.of(0, 'SAT'));
  readonly isSending = signal(false);

  private readonly amountSats = computed(() => {
    const amt = this.amount();
    if (!amt || amt.value === 0) return 0;
    if (amt.currency === 'SAT') return Math.round(amt.value);
    return Math.round(this.currencyService.convert(amt, 'SAT').value);
  });

  readonly insufficientBalance = computed(() => {
    const sats = this.amountSats();
    const balance = this.accountService.balance();
    if (sats <= 0 || !balance) return false;
    return sats > balance.value;
  });

  readonly canSend = computed(() => {
    return this.amountSats() > 0 && !this.insufficientBalance() && !this.isSending();
  });

  readonly buttonLabel = computed(() => {
    if (this.isSending()) return this.i18n.t('support.button.sending');
    const sats = this.amountSats();
    if (sats <= 0) return this.i18n.t('support.button.default');
    if (sats < 100) return this.i18n.t('support.button.tiers.espresso');
    if (sats < 1_000) return this.i18n.t('support.button.tiers.cappuccino');
    if (sats < 10_000) return this.i18n.t('support.button.tiers.cappuccinoDeluxe');
    return this.i18n.t('support.button.tiers.grandCru');
  });

  setQuickAmount(sats: number): void {
    this.amount.set(Amount.of(sats, 'SAT'));
  }

  async send(): Promise<void> {
    if (!this.canSend()) return;
    this.isSending.set(true);
    try {
      const success = await this.payService.sendDonation(this.amountSats());
      if (success) {
        this.notificationService.success({
          message: this.i18n.t('support.notifications.thanks'),
          useConfetti: true,
        });
        this.amount.set(Amount.of(0, 'SAT'));
      }
    } catch {
      // HTTP errors are handled by the interceptor
    } finally {
      this.isSending.set(false);
    }
  }
}
