import {CommonModule} from '@angular/common';
import {Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';
import {ButtonComponent} from '../../components/button/button.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-create-account',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonComponent, GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './create-account.page.html',
  styleUrl: './create-account.page.scss',
})
export class CreateAccountPage {
  readonly authService = inject(AuthService);

  readonly username = signal('');

  onSubmit(): void {
    const name = this.username().trim();
    if (!name) return;
    void this.authService.signUp(name);
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
