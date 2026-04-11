import {Component, inject} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout';
import {FaqContentService} from './faq-content.service';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [TranslateModule, GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './faq.page.html',
  styleUrl: './faq.page.scss',
})
export class FaqPage {
  private readonly faqContent = inject(FaqContentService);
  readonly sections = this.faqContent.sections;
}
