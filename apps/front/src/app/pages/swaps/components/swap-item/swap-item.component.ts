import {CommonModule, DatePipe} from '@angular/common';
import {Component, computed, inject, input} from '@angular/core';
import {Amount, Currency, formatSwapDirection, isTerminalStatus, type StoredSwap} from '../../../../model';
import {CurrencyService} from '../../../../services/currency.service';
import {SwapPollingService} from '../../../../services/swap-polling.service';

@Component({
  selector: 'app-swap-item',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './swap-item.component.html',
  styleUrl: './swap-item.component.scss',
})
export class SwapItemComponent {
  private readonly pollingService = inject(SwapPollingService);
  private readonly currencyService = inject(CurrencyService);

  swap = input.required<StoredSwap>();

  readonly isPolling = computed(() => this.pollingService.isPolling(this.swap().id));
  readonly isTerminal = computed(() => isTerminalStatus(this.swap().lastKnownStatus));
  readonly directionLabel = computed(() => formatSwapDirection(this.swap().direction));

  readonly formattedAmount = computed(() => {
    const s = this.swap();
    const sign = s.type === 'receive' ? '+' : '-';
    const currency = this.currencyService.currentCurrency();
    const rates = this.currencyService.rates();
    const amount = Amount.of(s.amountSats, 'SAT').convert(currency, rates);
    return `${sign}${amount.format()} ${Currency.symbol(currency)}`;
  });

  readonly statusClass = computed(() => {
    const status = this.swap().lastKnownStatus;
    return `status-${status}`;
  });
}
