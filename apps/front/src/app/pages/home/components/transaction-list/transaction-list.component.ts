import {CommonModule, DatePipe} from '@angular/common';
import {Component, input} from '@angular/core';
import {Transaction} from "../../../../services/transaction.http.service";

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
})
export class TransactionListComponent {
  transactions = input.required<Transaction[]>();

  formatAmount(tx: Transaction): string {
    const sats = Number(tx.amount);
    const sign = tx.type === 'receive' ? '+' : '-';
    return `${sign}${sats.toLocaleString()} sat`;
  }
}
