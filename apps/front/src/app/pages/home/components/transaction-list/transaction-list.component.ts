import {CommonModule, DatePipe} from '@angular/common';
import {Component, input} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {DisplayedTransaction} from '../../../../services/transaction.service';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [CommonModule, DatePipe, TranslateModule],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
})
export class TransactionListComponent {
  transactions = input.required<DisplayedTransaction[]>();
}
