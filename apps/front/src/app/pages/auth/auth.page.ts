import {CommonModule} from '@angular/common';
import {Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';
import {ButtonComponent} from "../../components/button/button.component";
import {PwaInstallBannerComponent} from '../../components/pwa-install-banner/pwa-install-banner.component';
import {FullPageLayoutComponent} from '../../layout';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonComponent, FullPageLayoutComponent, PwaInstallBannerComponent],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage {
  readonly authService: AuthService = inject(AuthService);

  username = signal('');

  onSignIn(): void {
    void this.authService.signIn();
  }

  onSignUp(): void {
    void this.authService.signUp(this.username());
  }

  updateUsername(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = input.value.replaceAll(/[^\w]/g, '');
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
    this.username.set(sanitized);
  }
}
