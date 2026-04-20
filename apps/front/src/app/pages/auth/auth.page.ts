import {CommonModule} from '@angular/common';
import {Component, inject} from '@angular/core';
import {Router} from '@angular/router';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';
import {ButtonComponent} from '../../components/button/button.component';
import {PwaInstallBannerComponent} from '../../components/pwa-install-banner/pwa-install-banner.component';
import {FullPageLayoutComponent} from '../../layout';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, TranslateModule, FaIconComponent, ButtonComponent, FullPageLayoutComponent, PwaInstallBannerComponent],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  onSignIn(): void {
    void this.authService.signIn();
  }

  openCreateAccount(): void {
    void this.router.navigate(['/create-account']);
  }
}
