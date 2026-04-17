import {Component, inject, type OnInit, signal} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';

import {FullPageLayoutComponent} from '../../layout';
import {PwaUpdateService} from '../../services/pwa-update.service';

/**
 * Duration of the animated splash logo. The status banner is held back
 * until at least this much time has elapsed, so the logo animation plays
 * fully even when the SW download resolves almost instantly.
 */
const LOGO_ANIMATION_MS = 5000;

/**
 * How long the "Up to date" status stays on screen after it appears,
 * before we force the reload. Gives the user time to see the animated
 * checkmark draw itself.
 */
const POST_UPDATE_DWELL_MS = 1500;

/**
 * Full-screen page displayed by AuthService after sign-in when a pending
 * PWA update has been detected. Reveals the animated logo, waits for both
 * the SW download and the logo animation to finish, then shows a brief
 * confirmation before reloading into the new version.
 */
@Component({
  selector: 'app-updating',
  standalone: true,
  imports: [TranslateModule, FullPageLayoutComponent],
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
    // Defer the heavy SW download until after the browser has painted at
    // least one frame of the animated splash. Without this hop, the download
    // can start on the same frame the logo is revealed and the user sees
    // nothing during the first hundreds of ms on slow devices.
    await new Promise<void>(resolve => { requestAnimationFrame(() => { resolve(); }); });

    const logoAnimation = new Promise<void>(resolve => setTimeout(resolve, LOGO_ANIMATION_MS));
    await Promise.all([this.pwaUpdate.download(), logoAnimation]);

    this.showStatus.set(true);
    await new Promise<void>(resolve => setTimeout(resolve, POST_UPDATE_DWELL_MS));
    this.pwaUpdate.reload();
  }
}
