import {HttpErrorResponse} from '@angular/common/http';
import type { OnDestroy} from '@angular/core';
import {inject, Injectable} from '@angular/core';
import type { Subscription} from 'rxjs';
import {catchError, filter, interval, of, switchMap, takeWhile, tap} from 'rxjs';
import {isTerminalStatus, type StoredSwap, type SwapStatus} from '../model';
import {AccountService} from './account.service';
import {I18nService} from './i18n.service';
import {NotificationService} from './notification.service';
import {SwapHttpService} from './swap.http.service';
import {SwapStorageService} from './swap-storage.service';
import {TransactionService} from './transaction.service';

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
          const previousStatus = storedSwap?.lastKnownStatus;
          const newStatus = response.status as SwapStatus;

          this.storageService.updateSwapStatus(swapId, newStatus);

          if (previousStatus && previousStatus !== newStatus) {
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

  private showStatusNotification(storedSwap: StoredSwap | undefined, newStatus: SwapStatus): void {
    const type = storedSwap?.type === 'receive'
      ? this.i18n.t('notifications.swapTypeReceive')
      : this.i18n.t('notifications.swapTypePayment');

    switch (newStatus) {
      case 'paid':
        this.notificationService.info({
          message: this.i18n.t('notifications.swapDetected', {type}),
        });
        break;
      case 'confirming':
        this.notificationService.info({
          message: this.i18n.t('notifications.swapConfirming', {type}),
        });
        break;
      case 'completed':
        this.notificationService.success({
          message: this.i18n.t('notifications.swapCompleted', {type}),
          useConfetti: true,
        });
        break;
      case 'expired':
        this.notificationService.error({
          message: this.i18n.t('notifications.swapExpired', {type}),
        });
        break;
      case 'failed':
        this.notificationService.error({
          message: this.i18n.t('notifications.swapFailed', {type}),
        });
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
