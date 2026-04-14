import {inject, Injectable, signal} from '@angular/core';
import {SwUpdate, type VersionReadyEvent} from '@angular/service-worker';
import pTimeout, {TimeoutError} from 'p-timeout';
import {filter, firstValueFrom, timeout} from 'rxjs';

import {SwapHttpService} from './swap.http.service';

/**
 * Maximum time we wait for `swUpdate.activateUpdate()` to resolve before we
 * force a page reload anyway. On some mobile PWAs (iOS standalone, certain
 * Android configurations) that promise can hang indefinitely. Reloading is
 * safe because the new SW is already downloaded and waiting.
 */
const ACTIVATE_UPDATE_TIMEOUT_MS = 5000;

/**
 * Drives the PWA "login only" update strategy.
 *
 * AuthService reads `updateAvailable` right after sign-in. If true, it routes
 * the user to /updating, which then orchestrates the safety check, SW
 * activation and reload itself.
 */
@Injectable({
  providedIn: 'root',
})
export class PwaUpdateService {

  private readonly swUpdate = inject(SwUpdate);
  private readonly swapHttp = inject(SwapHttpService);

  readonly updateAvailable = signal(false);

  init(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }
    this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateAvailable.set(true);
      });
  }

  /**
   * Queries the backend for active swaps within the given budget. Any failure
   * (network, timeout, server error) is treated conservatively as "not safe"
   * to protect in-flight payments.
   */
  async isSafeToReload(budgetMs: number): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.swapHttp.getActive().pipe(timeout({first: budgetMs})),
      );
      return !response.active;
    } catch {
      return false;
    }
  }

  /**
   * Activates the pending Service Worker update, bounded by a timeout. Any
   * failure or timeout is logged and swallowed — the caller is expected to
   * reload anyway, since the new SW is already downloaded and the fresh
   * navigation will pick it up.
   */
  async activate(): Promise<void> {
    try {
      await pTimeout(this.swUpdate.activateUpdate(), {
        milliseconds: ACTIVATE_UPDATE_TIMEOUT_MS,
        message: 'SW activateUpdate timed out',
      });
    } catch (error) {
      if (error instanceof TimeoutError) {
        console.error('SW activateUpdate hung, forcing reload', error);
      } else {
        console.error('Failed to activate SW update', error);
      }
    }
  }

  /**
   * Forces a full page reload so the browser picks up the newly activated
   * Service Worker and its fresh assets.
   */
  reload(): void {
    document.location.assign('/');
  }
}
