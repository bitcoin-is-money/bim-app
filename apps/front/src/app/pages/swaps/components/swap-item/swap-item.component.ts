import {CommonModule, DatePipe} from '@angular/common';
import {Component, computed, inject, input} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import type { SwapDirection} from '../../../../model';
import {Amount, Currency, isTerminalStatus, type StoredSwap} from '../../../../model';
import {CurrencyService} from '../../../../services/currency.service';
import {I18nService} from '../../../../services/i18n.service';
import {SwapPollingService} from '../../../../services/swap-polling.service';

const DIRECTION_KEYS: Record<SwapDirection, string> = {
  lightning_to_starknet: 'swaps.direction.lightningReceive',
  bitcoin_to_starknet: 'swaps.direction.bitcoinReceive',
  starknet_to_lightning: 'swaps.direction.lightningPay',
  starknet_to_bitcoin: 'swaps.direction.bitcoinPay',
};

@Component({
  selector: 'app-swap-item',
  standalone: true,
  imports: [CommonModule, DatePipe, TranslateModule],
  templateUrl: './swap-item.component.html',
  styleUrl: './swap-item.component.scss',
})
export class SwapItemComponent {
  private readonly pollingService = inject(SwapPollingService);
  private readonly currencyService = inject(CurrencyService);
  private readonly i18nService = inject(I18nService);

  swap = input.required<StoredSwap>();

  readonly isPolling = computed(() => this.pollingService.isPolling(this.swap().id));
  readonly isTerminal = computed(() => isTerminalStatus(this.swap().lastKnownStatus));
  readonly directionKey = computed(() => DIRECTION_KEYS[this.swap().direction]);
  readonly statusKey = computed(() => `swaps.status.${this.swap().lastKnownStatus}`);

  readonly formattedAmount = computed(() => {
    const s = this.swap();
    const sign = s.type === 'receive' ? '+' : '-';
    const currency = this.currencyService.currentCurrency();
    const rates = this.currencyService.rates();
    const amount = Amount.of(s.amountSats, 'SAT').convert(currency, rates);
    return `${sign}${amount.format(this.i18nService.currentLocale())} ${Currency.symbol(currency)}`;
  });

  readonly statusClass = computed(() => {
    const status = this.swap().lastKnownStatus;
    return `status-${status}`;
  });
}
