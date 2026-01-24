import {CommonModule} from '@angular/common';
import {Component, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {ButtonComponent} from "../../components/button/button.component";
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage {
  username = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  async onSignIn(): Promise<void> {
    this.error.set(null);
    this.isLoading.set(true);

    try {
      const username = this.username();
      if (!username) {
        const promptUsername = prompt('Please enter your username');
        if (!promptUsername) {
          this.isLoading.set(false);
          return;
        }
        this.username.set(promptUsername);
      }

      const finalUsername = this.username();
      if (!finalUsername) {
        this.error.set('Please enter a username');
        this.isLoading.set(false);
        return;
      }

      const beginResponse = await this.authService.beginLogin(finalUsername).toPromise();
      if (!beginResponse) {
        throw new Error('Failed to initialize login');
      }

      const options = this.authService.convertAuthOptions(beginResponse.options);
      const credential = await navigator.credentials.get({
        publicKey: options,
      }) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error('Authentication cancelled');
      }

      await this.authService.completeLogin(beginResponse.challengeId, credential).toPromise();
      this.router.navigate(['/home']);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      this.error.set(errorMessage);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSignUp(): Promise<void> {
    this.error.set(null);
    this.isLoading.set(true);

    try {
      const username = this.username();
      if (!username || username.length < 3) {
        this.error.set('Username must be at least 3 characters');
        this.isLoading.set(false);
        return;
      }

      const beginResponse = await this.authService.beginRegister(username).toPromise();
      if (!beginResponse) {
        throw new Error('Failed to initialize registration');
      }

      // Convert options for credential creation
      const options = this.authService.convertRegistrationOptions(beginResponse.options);
      const credential = await navigator.credentials.create({
        publicKey: options,
      }) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error('Registration cancelled');
      }

      await this.authService.completeRegister(beginResponse.challengeId, username, credential).toPromise();
      this.router.navigate(['/home']);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      this.error.set(errorMessage);
    } finally {
      this.isLoading.set(false);
    }
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
