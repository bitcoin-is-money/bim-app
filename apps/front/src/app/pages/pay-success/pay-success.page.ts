import type { OnInit} from '@angular/core';
import {Component, inject} from '@angular/core';
import {Router} from '@angular/router';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';
import {FullPageLayoutComponent} from '../../layout';

@Component({
  selector: 'app-pay-success',
  standalone: true,
  imports: [TranslateModule, FaIconComponent, FullPageLayoutComponent],
  templateUrl: './pay-success.page.html',
  styleUrl: './pay-success.page.scss',
})
export class PaySuccessPage implements OnInit {

  private readonly router = inject(Router);

  ngOnInit(): void {
    setTimeout(() => this.router.navigate(['/home']), 2000);
  }
}
