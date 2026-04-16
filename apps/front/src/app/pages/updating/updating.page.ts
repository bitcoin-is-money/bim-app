import {Component, inject, type OnInit, signal} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';

import {SpinnerComponent} from '../../components/spinner/spinner.component';
import {FullPageLayoutComponent} from '../../layout';
import {PwaUpdateService} from '../../services/pwa-update.service';

/**
 * Minimum time the page stays visible once the animated logo is revealed,
 * to prevent an imperceptible flash when SW activation is near-instant.
 */
const MINIMUM_DISPLAY_MS = 4900;

/**
 * Delay before revealing the "updating" status (spinner + text) once the
 * logo is on screen, so the message only appears if the update lingers.
 */
const STATUS_REVEAL_DELAY_MS = 3000;

/**
 * Full-screen page displayed by AuthService after sign-in when a pending
 * PWA update has been detected. Reveals the animated logo and applies the
 * update after a minimum display time so the splash is always perceptible.
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

  readonly showStatus = signal(false);

  ngOnInit(): void {
    void this.runUpdateFlow();
  }

  private async runUpdateFlow(): Promise<void> {
    setTimeout(() => { this.showStatus.set(true); }, STATUS_REVEAL_DELAY_MS);

    const minDisplay = new Promise<void>(resolve => setTimeout(resolve, MINIMUM_DISPLAY_MS));

    // Defer the heavy SW download until after the browser has painted at
    // least one frame of the animated splash. Without this hop, the download
    // can start on the same frame the logo is revealed and the user sees
    // nothing during the first hundreds of ms on slow devices.
    const downloaded = new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        void this.pwaUpdate.download().then(resolve);
      });
    });

    await Promise.all([downloaded, minDisplay]);
    this.pwaUpdate.reload();
  }
}
