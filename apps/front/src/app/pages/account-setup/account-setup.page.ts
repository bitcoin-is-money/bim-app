import {Component, DestroyRef, inject, OnInit, signal} from '@angular/core';
import {Router} from '@angular/router';
import {ButtonComponent} from '../../components/button/button.component';
import {SpinnerComponent} from '../../components/spinner/spinner.component';
import {AccountService} from '../../services/account.service';
import {AuthService} from "../../services/auth.service";
import {NotificationService} from '../../services/notification.service';

const POLL_INTERVAL_MS = 1000;

@Component({
  selector: 'app-account-setup',
  standalone: true,
  imports: [SpinnerComponent, ButtonComponent],
  templateUrl: './account-setup.page.html',
  styleUrl: './account-setup.page.scss',
})
export class AccountSetupPage implements OnInit {
  failed = signal(false);
  errorMessage = signal('');

  private readonly authService = inject(AuthService);
  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.startPolling();
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  goBack(): void {
    this.authService.signOut();
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => this.checkDeploymentStatus(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private checkDeploymentStatus(): void {
    this.accountService.getDeploymentStatus().subscribe({
      next: (response) => {
        if (response.status === 'deployed') {
          this.stopPolling();
          this.notifications.success({
            message: 'Account created successfully',
            useConfetti: true
          });
          this.router.navigate(['/home']);
        } else if (response.status === 'failed') {
          this.stopPolling();
          this.failed.set(true);
          this.errorMessage.set('Account deployment failed');
        }
      },
      error: () => {
        this.stopPolling();
        this.failed.set(true);
        this.errorMessage.set('An unexpected error occurred');
      },
    });
  }
}
