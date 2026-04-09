import {HttpErrorResponse} from '@angular/common/http';
import type { OnDestroy} from '@angular/core';
import {inject, Injectable} from '@angular/core';
import type { Subscription} from 'rxjs';
import {catchError, filter, interval, of, switchMap, takeWhile, tap} from 'rxjs';
import {isTerminalStatus, type StoredSwap, type SwapDirection, type SwapStatus} from '../model';
import {AccountService} from './account.service';
import {I18nService} from './i18n.service';
import {NotificationService} from './notification.service';
import {SwapHttpService} from './swap.http.service';
import {SwapStorageService} from './swap-storage.service';
import {TransactionService} from './transaction.service';

type NotificationKind = 'info' | 'success' | 'error';

interface NotificationEntry {
  readonly key: string;
  readonly kind: NotificationKind;
  readonly useConfetti?: boolean;
}

/**
 * Maps (direction, status) tuples to the notification to display.
 * Missing entries mean "no notification for this transition" — e.g. sends
 * skip the intermediate `paid` to avoid noise between "Payment sent" and
 * the terminal state.
 */
const NOTIFICATIONS: Record<SwapDirection, Partial<Record<SwapStatus, NotificationEntry>>> = {
  lightning_to_starknet: {
    paid:      {key: 'notifications.receive.lightning.paid',      kind: 'info'},
    completed: {key: 'notifications.receive.lightning.completed', kind: 'success', useConfetti: true},
    expired:   {key: 'notifications.receive.lightning.expired',   kind: 'error'},
    failed:    {key: 'notifications.receive.lightning.failed',    kind: 'error'},
    lost:      {key: 'notifications.receive.lightning.lost',      kind: 'error'},
  },
  bitcoin_to_starknet: {
    paid:      {key: 'notifications.receive.bitcoin.paid',      kind: 'info'},
    completed: {key: 'notifications.receive.bitcoin.completed', kind: 'success', useConfetti: true},
    expired:   {key: 'notifications.receive.bitcoin.expired',   kind: 'error'},
    failed:    {key: 'notifications.receive.bitcoin.failed',    kind: 'error'},
    lost:      {key: 'notifications.receive.bitcoin.lost',      kind: 'error'},
  },
  starknet_to_lightning: {
    completed:  {key: 'notifications.send.lightning.completed', kind: 'success', useConfetti: true},
    refunded:   {key: 'notifications.send.lightning.refunded',  kind: 'info'},
    failed:     {key: 'notifications.send.lightning.failed',    kind: 'error'},
    lost:       {key: 'notifications.send.lightning.lost',      kind: 'error'},
  },
  starknet_to_bitcoin: {
    completed:  {key: 'notifications.send.bitcoin.completed',  kind: 'success', useConfetti: true},
    refundable: {key: 'notifications.send.bitcoin.refundable', kind: 'error'},
    refunded:   {key: 'notifications.send.bitcoin.refunded',   kind: 'info'},
    failed:     {key: 'notifications.send.bitcoin.failed',     kind: 'error'},
    lost:       {key: 'notifications.send.bitcoin.lost',       kind: 'error'},
  },
};

const POLL_INTERVAL_MS = 5000;
const POLL_DURATION_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_ERRORS = 3;

interface ActivePoll {
  swapId: string;
  subscription: Subscription;
  startedAt: number;
  consecutiveErrors: number;
}

@Injectable({
  providedIn: 'root',
})
export class SwapPollingService implements OnDestroy {
  private readonly httpService = inject(SwapHttpService);
  private readonly storageService = inject(SwapStorageService);
  private readonly notificationService = inject(NotificationService);
  private readonly accountService = inject(AccountService);
  private readonly transactionService = inject(TransactionService);
  private readonly i18n = inject(I18nService);

  private readonly activePolls = new Map<string, ActivePoll>();

  private visibilityHandler: (() => void) | null = null;

  constructor() {
    this.setupVisibilityHandler();
    this.resumeActiveSwaps();
  }

  ngOnDestroy(): void {
    this.stopAllPolling();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  startPolling(swapId: string): void {
    if (this.activePolls.has(swapId)) {
      return;
    }

    const storedSwap = this.storageService.getSwap(swapId);
    if (storedSwap && isTerminalStatus(storedSwap.lastKnownStatus, storedSwap.direction)) {
      return;
    }

    const startedAt = Date.now();

    const subscription = interval(POLL_INTERVAL_MS)
      .pipe(
        takeWhile(() => Date.now() - startedAt < POLL_DURATION_MS),
        filter(() => document.visibilityState === 'visible'),
        switchMap(() =>
          this.httpService.getStatus(swapId, {silent: true}).pipe(
            catchError((err) => {
              this.logSwapError(swapId, err);
              if (err instanceof HttpErrorResponse && err.status === 404) {
                this.storageService.updateSwapStatus(swapId, 'lost');
                this.stopPolling(swapId);
              } else {
                this.incrementErrors(swapId);
              }
              return of(null);
            })
          )
        ),
        tap((response) => {
          if (!response) return;

          this.resetErrors(swapId);

          const storedSwap = this.storageService.getSwap(swapId);
          const newStatus = response.status as SwapStatus;

          this.storageService.updateSwapStatus(swapId, newStatus);

          if (storedSwap && storedSwap.lastKnownStatus !== newStatus) {
            this.showStatusNotification(storedSwap, newStatus);
          }

          if (newStatus === 'completed') {
            this.accountService.loadBalance();
            this.transactionService.loadFirst();
          }

          if (isTerminalStatus(newStatus, storedSwap?.direction)) {
            this.stopPolling(swapId);
          }
        })
      )
      .subscribe();

    this.activePolls.set(swapId, {
      swapId,
      subscription,
      startedAt,
      consecutiveErrors: 0,
    });
  }

  stopPolling(swapId: string): void {
    const poll = this.activePolls.get(swapId);
    if (poll) {
      poll.subscription.unsubscribe();
      this.activePolls.delete(swapId);
    }
  }

  stopAllPolling(): void {
    for (const poll of this.activePolls.values()) {
      poll.subscription.unsubscribe();
    }
    this.activePolls.clear();
  }

  isPolling(swapId: string): boolean {
    return this.activePolls.has(swapId);
  }

  fetchStatusOnce(swapId: string): void {
    this.httpService.getStatus(swapId, {silent: true}).subscribe({
      next: (response) => {
        this.storageService.updateSwapStatus(swapId, response.status as SwapStatus);
      },
      error: (err) => {
        this.logSwapError(swapId, err);
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.storageService.updateSwapStatus(swapId, 'lost');
        }
      },
    });
  }

  private showStatusNotification(storedSwap: StoredSwap, newStatus: SwapStatus): void {
    // eslint-disable-next-line security/detect-object-injection -- direction is SwapDirection union, newStatus is SwapStatus union
    const entry = NOTIFICATIONS[storedSwap.direction][newStatus];
    if (entry) {
      this.fireNotification(entry);
    }

    // Bitcoin receive: the security deposit is refunded atomically with the
    // claim tx inside SwapMonitor, so completion implies the bounty is back
    // in the user's wallet — surface it as a separate toast.
    if (storedSwap.direction === 'bitcoin_to_starknet' && newStatus === 'completed') {
      this.fireNotification({
        key: 'notifications.receive.bitcoin.depositRefunded',
        kind: 'info',
      });
    }
  }

  private fireNotification(entry: NotificationEntry): void {
    const message = this.i18n.t(entry.key);
    switch (entry.kind) {
      case 'info':
        this.notificationService.info({message});
        break;
      case 'success':
        this.notificationService.success({
          message,
          ...(entry.useConfetti === true && {useConfetti: true}),
        });
        break;
      case 'error':
        this.notificationService.error({message});
        break;
    }
  }

  private incrementErrors(swapId: string): void {
    const poll = this.activePolls.get(swapId);
    if (!poll) return;

    poll.consecutiveErrors++;
    if (poll.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.warn(`Stopping polling for swap ${swapId} after ${poll.consecutiveErrors} consecutive errors`);
      this.stopPolling(swapId);
    }
  }

  private resetErrors(swapId: string): void {
    const poll = this.activePolls.get(swapId);
    if (poll) {
      poll.consecutiveErrors = 0;
    }
  }

  private logSwapError(swapId: string, err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 404) {
      console.warn(`Swap not found: ${swapId}`);
    } else {
      console.error(`Failed to fetch swap status ${swapId}:`, err);
    }
  }

  private setupVisibilityHandler(): void {
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.resumeActiveSwaps();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private resumeActiveSwaps(): void {
    const cutoff = Date.now() - POLL_DURATION_MS;
    const activeSwaps = this.storageService.getActiveSwaps();

    for (const swap of activeSwaps) {
      const createdAt = new Date(swap.createdAt).getTime();
      if (createdAt > cutoff && !this.activePolls.has(swap.id)) {
        this.startPolling(swap.id);
      }
    }
  }
}
