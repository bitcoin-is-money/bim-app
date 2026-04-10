import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {SwUpdate, type VersionReadyEvent} from '@angular/service-worker';
import {filter, firstValueFrom, timeout} from 'rxjs';

import {SwapHttpService} from './swap.http.service';

/**
 * Total budget for the pre-update check (checkForUpdate wait + active-swap
 * query). The native SW check is effectively instant (hash comparison), so
 * 3 seconds is generous. If the budget is exceeded, we skip the update and
 * retry at the next login.
 */
const UPDATE_CHECK_BUDGET_MS = 5000;

/**
 * Drives the PWA "login only" update strategy.
 *
 * Workflow:
 *   1. The SW downloads new versions in the background automatically.
 *   2. Exactly once per login transition, AuthService calls
 *      tryApplyUpdate(). We then:
 *        a. Force a fresh SW check.
 *        b. If a VERSION_READY arrives within the budget, ask the backend
 *           whether the account has any active swaps.
 *        c. If no active swap, navigate to /updating, activate the new SW
 *           and reload. Otherwise we do nothing and retry at the next login.
 *
 * We never reload the app during an active session, and we never trust
 * localStorage to decide "is there a swap in progress?" — only the backend.
 */
@Injectable({
  providedIn: 'root',
})
export class PwaUpdateService {

  private readonly swUpdate = inject(SwUpdate);
  private readonly swapHttp = inject(SwapHttpService);
  private readonly router = inject(Router);

  /** Emits true as soon as a new SW version is downloaded and ready to activate. */
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
   * Called by AuthService right after a successful login / session restore.
   *
   * Resolves without reloading when:
   *   - the SW is disabled (dev mode),
   *   - no update is pending within the 3-second budget,
   *   - a check fails for any reason,
   *   - an active swap is detected.
   *
   * Otherwise navigates to /updating and triggers a full reload. In that
   * case the returned promise never resolves — the page goes away first.
   */
  async tryApplyUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    const startedAt = Date.now();

    const hasUpdate = await this.waitForUpdate(UPDATE_CHECK_BUDGET_MS);
    if (!hasUpdate) {
      return;
    }

    const remainingBudgetMs = Math.max(0, UPDATE_CHECK_BUDGET_MS - (Date.now() - startedAt));
    if (remainingBudgetMs === 0) {
      return;
    }

    const safeToReload = await this.isSafeToReload(remainingBudgetMs);
    if (!safeToReload) {
      return;
    }

    await this.applyUpdateAndReload();
  }

  /**
   * Forces a fresh SW check and waits for VERSION_READY, bounded by the
   * caller-supplied budget. Returns true if an update is ready to activate.
   *
   * If the check throws (offline, stale cache, etc.) we treat it as "no
   * update" so the user is never blocked by our optional check.
   */
  private async waitForUpdate(budgetMs: number): Promise<boolean> {
    if (this.updateAvailable()) {
      return true;
    }
    try {
      const checkPromise = this.swUpdate.checkForUpdate();
      const deadline = new Promise<boolean>((resolve) => {
        setTimeout(() => { resolve(false); }, budgetMs);
      });
      const result = await Promise.race([checkPromise, deadline]);
      return result || this.updateAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Queries the backend for active swaps within the remaining budget.
   * Any failure (network, timeout, server error) is treated conservatively
   * as "not safe" to protect in-flight payments.
   */
  private async isSafeToReload(budgetMs: number): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.swapHttp.getActive().pipe(timeout({first: budgetMs})),
      );
      return !response.active;
    } catch {
      return false;
    }
  }

  private async applyUpdateAndReload(): Promise<void> {
    await this.router.navigate(['/updating']);
    try {
      await this.swUpdate.activateUpdate();
    } catch (error) {
      console.error('Failed to activate SW update', error);
    }
    document.location.reload();
  }
}
