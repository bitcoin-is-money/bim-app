import {HttpErrorResponse} from '@angular/common/http';
import type {OnInit} from '@angular/core';
import {Component, DestroyRef, inject, signal} from '@angular/core';
import {Router} from '@angular/router';
import {TranslateModule} from '@ngx-translate/core';
import {ButtonComponent} from '../../components/button/button.component';
import {SpinnerComponent} from '../../components/spinner/spinner.component';
import {FullPageLayoutComponent} from '../../layout';
import {AccountService} from '../../services/account.service';
import {AuthService} from "../../services/auth.service";
import {I18nService} from '../../services/i18n.service';
import {NotificationService} from '../../services/notification.service';

const POLL_INTERVAL_MS = 1000;

@Component({
  selector: 'app-account-setup',
  standalone: true,
  imports: [TranslateModule, SpinnerComponent, ButtonComponent, FullPageLayoutComponent],
  templateUrl: './account-setup.page.html',
  styleUrl: './account-setup.page.scss',
})
export class AccountSetupPage implements OnInit {
  failed = signal(false);
  errorMessage = signal('');

  private readonly authService = inject(AuthService);
  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.triggerDeployment();
    this.destroyRef.onDestroy(() => { this.stopPolling(); });
  }

  private triggerDeployment(): void {
    this.accountService.deploy().subscribe({
      next: (response) => {
        // Address is known as soon as deploy responds — update the auth signal
        this.authService.updateStarknetAddress(response.starknetAddress);
        // Deployment started, begin polling for status
        this.startPolling();
      },
      error: (err: unknown) => {
        // Check if the account is already deploying or deployed (not an error)
        if (err instanceof HttpErrorResponse && err.status === 400) {
          // Account may already be deploying, start polling anyway
          this.startPolling();
        } else {
          this.failed.set(true);
          this.errorMessage.set(this.i18n.t('accountSetup.deploymentStartFailed'));
        }
      },
    });
  }

  goBack(): void {
    void this.authService.signOut();
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => { this.checkDeploymentStatus(); }, POLL_INTERVAL_MS);
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
            message: this.i18n.t('accountSetup.success'),
            useConfetti: true
          });
          void this.router.navigate(['/home']);
        } else if (response.status === 'failed') {
          this.stopPolling();
          this.failed.set(true);
          this.errorMessage.set(this.i18n.t('accountSetup.deploymentFailed'));
        }
      },
      error: () => {
        this.stopPolling();
        this.failed.set(true);
        this.errorMessage.set(this.i18n.t('accountSetup.unexpectedError'));
      },
    });
  }
}
