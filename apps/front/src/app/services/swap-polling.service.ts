import {inject, Injectable, OnDestroy} from '@angular/core';
import {catchError, filter, interval, of, Subscription, switchMap, takeWhile, tap} from 'rxjs';
import {isTerminalStatus, type StoredSwap, type SwapStatus} from '../model';
import {I18nService} from './i18n.service';
import {NotificationService} from './notification.service';
import {SwapHttpService} from './swap.http.service';
import {SwapStorageService} from './swap-storage.service';

const POLL_INTERVAL_MS = 5000;
const POLL_DURATION_MS = 5 * 60 * 1000;

interface ActivePoll {
  swapId: string;
  subscription: Subscription;
  startedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class SwapPollingService implements OnDestroy {
  private readonly httpService = inject(SwapHttpService);
  private readonly storageService = inject(SwapStorageService);
  private readonly notificationService = inject(NotificationService);
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

    const startedAt = Date.now();

    const subscription = interval(POLL_INTERVAL_MS)
      .pipe(
        takeWhile(() => Date.now() - startedAt < POLL_DURATION_MS),
        filter(() => document.visibilityState === 'visible'),
        switchMap(() =>
          this.httpService.getStatus(swapId).pipe(
            catchError((err) => {
              console.error(`Failed to poll swap ${swapId}:`, err);
              return of(null);
            })
          )
        ),
        tap((response) => {
          if (!response) return;

          const storedSwap = this.storageService.getSwap(swapId);
          const previousStatus = storedSwap?.lastKnownStatus;
          const newStatus = response.status as SwapStatus;

          this.storageService.updateSwapStatus(swapId, newStatus);

          if (previousStatus && previousStatus !== newStatus) {
            this.showStatusNotification(storedSwap, newStatus);
          }

          if (isTerminalStatus(newStatus)) {
            this.stopPolling(swapId);
          }
        })
      )
      .subscribe();

    this.activePolls.set(swapId, {
      swapId,
      subscription,
      startedAt,
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
    this.httpService.getStatus(swapId).subscribe({
      next: (response) => {
        this.storageService.updateSwapStatus(swapId, response.status as SwapStatus);
      },
      error: (err) => {
        console.error(`Failed to fetch swap status ${swapId}:`, err);
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
