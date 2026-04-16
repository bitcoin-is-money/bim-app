import {Component, computed, inject} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {PwaInstallService} from '../../services/pwa-install.service';
import {ButtonComponent} from '../button/button.component';

@Component({
  selector: 'app-pwa-install-info',
  standalone: true,
  imports: [TranslateModule, ButtonComponent],
  templateUrl: './pwa-install-info.component.html',
  styleUrl: './pwa-install-info.component.scss',
})
export class PwaInstallInfoComponent {

  private readonly pwa = inject(PwaInstallService);

  readonly isInstalled = this.pwa.isInstalled;
  readonly canInstall = this.pwa.canInstall;

  readonly manualKey = computed(() => `pwa.install.manual.${this.pwa.platform()}`);
  readonly uninstallKey = computed(() => {
    switch (this.pwa.platform()) {
      case 'ios':
        return 'pwa.install.installed.uninstallIos';
      case 'android':
        return 'pwa.install.installed.uninstallAndroid';
      default:
        return 'pwa.install.installed.uninstallDesktop';
    }
  });

  async onInstall(): Promise<void> {
    await this.pwa.promptInstall();
  }
}
