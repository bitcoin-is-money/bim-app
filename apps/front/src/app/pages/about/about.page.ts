import {Component} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout/full-page-layout/full-page-layout.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [TranslateModule, GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './about.page.html',
  styleUrl: './about.page.scss',
})
export class AboutPage {}
