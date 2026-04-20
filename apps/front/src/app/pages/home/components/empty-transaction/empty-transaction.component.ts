import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-empty-transaction',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './empty-transaction.component.html',
  styleUrl: './empty-transaction.component.scss',
})
export class EmptyTransactionComponent {}
