import {Component, inject, type OnInit, signal} from '@angular/core';
import {Router} from '@angular/router';
import {TranslateModule} from '@ngx-translate/core';

import {SpinnerComponent} from '../../components/spinner/spinner.component';
import {FullPageLayoutComponent} from '../../layout';
import {PwaUpdateService} from '../../services/pwa-update.service';

/**
 * Minimum time the page stays visible once the animated logo is revealed,
 * to prevent an imperceptible flash when SW activation is near-instant.
 */
const MINIMUM_DISPLAY_MS = 390000;

/**
 * Safety-check budget: how long we wait for the backend to answer whether
 * the account has any active swaps before considering the reload unsafe.
 */
const SAFETY_CHECK_BUDGET_MS = 5000;

/**
 * Full-screen page displayed by AuthService after sign-in when a pending
 * PWA update has been detected. Stays black during the safety check, then
 * either reveals the animated logo and applies the update, or navigates
 * silently to /home if the update is deemed unsafe (active swap in flight).
 */
@Component({
  selector: 'app-updating',
  standalone: true,
  imports: [TranslateModule, FullPageLayoutComponent, SpinnerComponent],
  templateUrl: './updating.page.html',
  styleUrl: './updating.page.scss',
})
export class UpdatingPage implements OnInit {

  private readonly pwaUpdate = inject(PwaUpdateService);
  private readonly router = inject(Router);

  readonly showContent = signal(false);

  ngOnInit(): void {
    void this.runUpdateFlow();
  }

  private async runUpdateFlow(): Promise<void> {
    const arrivedAt = Date.now();

    const safe = await this.pwaUpdate.isSafeToReload(SAFETY_CHECK_BUDGET_MS);
    if (!safe) {
      await this.router.navigate(['/home']);
      return;
    }

    this.showContent.set(true);

    const elapsed = Date.now() - arrivedAt;
    const remainingDisplay = Math.max(0, MINIMUM_DISPLAY_MS - elapsed);
    const minDisplay = new Promise<void>(resolve => setTimeout(resolve, remainingDisplay));

    await Promise.all([this.pwaUpdate.activate(), minDisplay]);
    this.pwaUpdate.reload();
  }
}
