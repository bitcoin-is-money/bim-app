import {CommonModule} from '@angular/common';
import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {Router} from '@angular/router';
import {BalanceDisplayComponent} from './components/balance-display/balance-display.component';
import {TransactionListComponent} from './components/transaction-list/transaction-list.component';
import {EmptyTransactionComponent} from './components/empty-transaction/empty-transaction.component';
import {SpinnerComponent} from '../../components/spinner/spinner.component';
import {Amount} from '../../model';
import {AccountService} from "../../services/account.service";
import {AuthService} from '../../services/auth.service';
import {TransactionService} from '../../services/transaction.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, BalanceDisplayComponent, TransactionListComponent, EmptyTransactionComponent, SpinnerComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {

  private readonly authService = inject(AuthService);
  private readonly accountService = inject(AccountService);
  readonly transactionService = inject(TransactionService);
  private readonly router = inject(Router);

  balance = signal<Amount | undefined>(undefined);

  isLoading = computed(() => {
    return this.balance() == undefined;
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.accountService.getBalance().subscribe({
      next: (balance) => {
        this.balance.set(balance);
      },
      error: (err) => {
        console.error('Error loading balance:', err);
      },
    });

    if (this.authService.isNewUser()) {
      this.authService.isNewUser.set(false);
      this.transactionService.setEmpty();
    } else {
      this.transactionService.loadFirst();
    }
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
    return this.currentUser?.username || '';
  }

  openMenu(): void {
    this.router.navigate(['/menu']);
  }

  onReceive(): void {
    // TODO: implement later
    console.log('Receive clicked');
  }

  onPay(): void {
    // TODO: implement later
    console.log('Pay clicked');
  }
}
