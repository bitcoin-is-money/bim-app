import {CommonModule} from '@angular/common';
import {Component, OnInit, signal} from '@angular/core';
import {Router} from '@angular/router';
import {BalanceDisplayComponent} from '../../components/balance-display/balance-display.component';
import {TransactionListComponent} from '../../components/transaction-list/transaction-list.component';
import {Amount} from '../../model';
import {AccountService} from "../../services/account.service";
import {AuthService} from '../../services/auth.service';
import {Transaction, TransactionService} from '../../services/transaction.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, BalanceDisplayComponent, TransactionListComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  balance = signal<Amount | null>(null);
  transactions = signal<Transaction[]>([]);
  isLoading = signal(true);

  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
    private readonly transactionService: TransactionService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);

    this.accountService.getBalance().subscribe({
      next: (balance) => {
        this.balance.set(balance);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading balance:', err);
        this.isLoading.set(false);
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
