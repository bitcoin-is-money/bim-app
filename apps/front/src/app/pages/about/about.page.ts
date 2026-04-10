import {Component} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {APP_VERSION} from '../../../environments/version';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {InfoFieldComponent} from '../../components/info-field/info-field.component';
import {FullPageLayoutComponent} from '../../layout';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [TranslateModule, GoBackHeaderComponent, InfoFieldComponent, FullPageLayoutComponent],
  templateUrl: './about.page.html',
  styleUrl: './about.page.scss',
})
export class AboutPage {
  readonly version = APP_VERSION;
}
