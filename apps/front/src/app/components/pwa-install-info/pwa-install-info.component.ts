import {Component, inject} from '@angular/core';
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
  readonly platform = this.pwa.platform;

  async onInstall(): Promise<void> {
    await this.pwa.promptInstall();
  }
}
