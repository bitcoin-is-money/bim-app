import {CommonModule} from '@angular/common';
import type { OnInit} from '@angular/core';
import {Component, inject} from '@angular/core';
import {Router} from '@angular/router';
import {TranslateModule} from '@ngx-translate/core';
import {forkJoin} from 'rxjs';
import {AmountHighlightComponent} from '../../components/amount-highlight/amount-highlight.component';
import {ButtonComponent} from "../../components/button/button.component";
import {type PullRefreshEvent, PullRefreshContainerComponent} from '../../components/pull-refresh-container/pull-refresh-container.component';
import {SpinnerComponent} from '../../components/spinner/spinner.component';
import {FullPageLayoutComponent} from '../../layout';
import {AccountService} from "../../services/account.service";
import {AuthService} from '../../services/auth.service';
import {TransactionService} from '../../services/transaction.service';
import {EmptyTransactionComponent} from './components/empty-transaction/empty-transaction.component';
import {TransactionListComponent} from './components/transaction-list/transaction-list.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule, AmountHighlightComponent, TransactionListComponent, EmptyTransactionComponent, SpinnerComponent, ButtonComponent, FullPageLayoutComponent, PullRefreshContainerComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {

  private readonly authService = inject(AuthService);
  readonly accountService = inject(AccountService);
  readonly transactionService = inject(TransactionService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.accountService.loadBalance();

    if (this.authService.isNewUser()) {
      this.authService.isNewUser.set(false);
      this.transactionService.setEmpty();
    } else {
      this.transactionService.loadFirst();
    }
  }

  onRefresh(event: PullRefreshEvent): void {
    forkJoin([
      this.accountService.getBalance(),
      this.transactionService.refresh(),
    ]).subscribe(() => event.complete());
  }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 100;
    const reachedBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
    if (reachedBottom) {
      this.transactionService.loadMore();
    }
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  get username(): string {
    return this.currentUser?.username ?? '';
  }

  openMenu(): void {
    void this.router.navigate(['/menu']);
  }

  onReceive(): void {
    void this.router.navigate(['/receive']);
  }

  onPay(): void {
    void this.router.navigate(['/pay']);
  }
}
