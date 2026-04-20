import {CommonModule, DatePipe} from '@angular/common';
import {Component, computed, inject, input} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import type {IconProp} from '@fortawesome/fontawesome-svg-core';
import {TranslateModule} from '@ngx-translate/core';
import {RailBadgeComponent} from '../../../../components/rail-badge/rail-badge.component';
import {I18nService} from '../../../../services/i18n.service';
import type {DisplayedTransaction} from '../../../../services/transaction.service';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [CommonModule, DatePipe, TranslateModule, FaIconComponent, RailBadgeComponent],
  templateUrl: './transaction-list.component.html',
  styleUrl: './transaction-list.component.scss',
})
export class TransactionListComponent {
  private readonly i18nService = inject(I18nService);

  transactions = input.required<DisplayedTransaction[]>();
  readonly locale = computed(() => this.i18nService.currentLocale());

  iconFor(t: DisplayedTransaction): IconProp {
    return t.isCredit ? ['fas', 'arrow-down'] : ['fas', 'arrow-up'];
  }
}
