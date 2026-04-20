import { Component, computed, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PwaInstallService } from '../../services/pwa-install.service';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-pwa-install-banner',
  standalone: true,
  imports: [TranslateModule, ButtonComponent],
  templateUrl: './pwa-install-banner.component.html',
  styleUrl: './pwa-install-banner.component.scss',
})
export class PwaInstallBannerComponent {
  private readonly pwa = inject(PwaInstallService);

  private readonly dismissed = signal(false);

  readonly canPrompt = this.pwa.canInstall;
  readonly manualKey = computed(() => `pwa.install.manual.${this.pwa.platform()}`);
  readonly visible = computed(() => !this.dismissed() && !this.pwa.isInstalled());

  async onInstall(): Promise<void> {
    const outcome = await this.pwa.promptInstall();
    if (outcome === 'accepted') {
      this.dismissed.set(true);
    }
  }

  onDismiss(): void {
    this.dismissed.set(true);
  }
}
