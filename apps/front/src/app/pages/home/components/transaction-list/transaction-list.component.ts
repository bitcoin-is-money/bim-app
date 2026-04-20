import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../../../services/i18n.service';
import type { DisplayedTransaction } from '../../../../services/transaction.service';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [CommonModule, DatePipe, TranslateModule],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
})
export class TransactionListComponent {
  private readonly i18nService = inject(I18nService);

  transactions = input.required<DisplayedTransaction[]>();
  readonly locale = computed(() => this.i18nService.currentLocale());
}
