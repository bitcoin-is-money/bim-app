import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-empty-transaction',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './empty-transaction.component.html',
  styleUrl: './empty-transaction.component.scss',
})
export class EmptyTransactionComponent {}
