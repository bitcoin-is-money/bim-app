import {CommonModule} from '@angular/common';
import {Component, input} from '@angular/core';

@Component({
  selector: 'app-balance-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './balance-display.component.html',
  styleUrl: './balance-display.component.scss',
})
export class BalanceDisplayComponent {
  amount = input<number>(0);
  currency = input<'USD' | 'BTC'>('USD');
}
