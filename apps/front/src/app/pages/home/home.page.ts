import {CommonModule} from '@angular/common';
import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {Router} from '@angular/router';
import {BalanceDisplayComponent} from './components/balance-display/balance-display.component';
import {TransactionListComponent} from './components/transaction-list/transaction-list.component';
import {EmptyTransactionComponent} from './components/empty-transaction/empty-transaction.component';
import {Amount} from '../../model';
import {AccountService} from "../../services/account.service";
import {AuthService} from '../../services/auth.service';
import {Transaction, TransactionService} from '../../services/transaction.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, BalanceDisplayComponent, TransactionListComponent, EmptyTransactionComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {

  private readonly authService = inject(AuthService);
  private readonly accountService = inject(AccountService);
  private readonly transactionService = inject(TransactionService);
  private readonly router = inject(Router);

  balance = signal<Amount | undefined>(undefined);
  transactions = signal<Transaction[] | undefined>(undefined);
  isLoading = computed(() => {
    return this.balance() == undefined || this.transactions() == undefined;
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

    this.transactionService.getTransactions().subscribe({
      next: (transactions) => {
        this.transactions.set(transactions);
      },
      error: (err) => {
        console.error('Error loading transactions:', err);
      },
    });
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
