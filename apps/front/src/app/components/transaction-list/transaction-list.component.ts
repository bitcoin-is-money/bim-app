import {CommonModule, DatePipe} from '@angular/common';
import {Component, input} from '@angular/core';
import {Transaction} from '../../services/transaction.service';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
})
export class TransactionListComponent {
  transactions = input.required<Transaction[]>();

  isCredit(amount: number): boolean {
    return amount > 0;
  }

  formatAmount(amount: number): string {
    const sign = amount > 0 ? '+' : '';
    return `${sign}${amount.toFixed(2)}`;
  }
}
