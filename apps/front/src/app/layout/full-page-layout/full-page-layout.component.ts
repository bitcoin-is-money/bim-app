import {Component, input} from '@angular/core';
import {LogoFooterComponent} from '../../components/logo-footer/logo-footer.component';

@Component({
  selector: 'app-full-page-layout',
  standalone: true,
  imports: [LogoFooterComponent],
  templateUrl: './full-page-layout.component.html',
  styleUrl: './full-page-layout.component.scss',
})
export class FullPageLayoutComponent {
  showFooter = input(true);
}
