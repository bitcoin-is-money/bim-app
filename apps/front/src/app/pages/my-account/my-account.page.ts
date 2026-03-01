import type { OnInit} from '@angular/core';
import {Component, inject, signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {TranslateModule} from '@ngx-translate/core';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {InfoFieldComponent} from '../../components/info-field/info-field.component';
import {FullPageLayoutComponent} from '../../layout';
import {AccountService} from '../../services/account.service';
import {I18nService} from '../../services/i18n.service';
import type {AccountInfoResponse} from '../../services/account.http.service';

@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [DatePipe, TranslateModule, GoBackHeaderComponent, InfoFieldComponent, FullPageLayoutComponent],
  templateUrl: './my-account.page.html',
  styleUrl: './my-account.page.scss',
})
export class MyAccountPage implements OnInit {
  private readonly i18n = inject(I18nService);
  readonly locale = this.i18n.currentLocale;
  readonly accountInfo = signal<AccountInfoResponse | undefined>(undefined);

  readonly loading = signal(true);

  private readonly accountService = inject(AccountService);

  ngOnInit(): void {
    this.accountService.getAccountInfo().subscribe({
      next: (info) => {
        this.accountInfo.set(info);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }
}
