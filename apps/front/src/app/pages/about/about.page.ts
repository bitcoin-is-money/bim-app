import { Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { APP_VERSION } from '../../../environments/version';
import { GoBackHeaderComponent } from '../../components/go-back-header/go-back-header.component';
import { PwaInstallInfoComponent } from '../../components/pwa-install-info/pwa-install-info.component';
import { FullPageLayoutComponent } from '../../layout';
import { AboutContentService } from './about-content.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [
    TranslateModule,
    GoBackHeaderComponent,
    FullPageLayoutComponent,
    PwaInstallInfoComponent,
  ],
  templateUrl: './about.page.html',
  styleUrl: './about.page.scss',
})
export class AboutPage {
  private readonly aboutContent = inject(AboutContentService);
  readonly version = APP_VERSION;
  readonly html = this.aboutContent.html;
}
