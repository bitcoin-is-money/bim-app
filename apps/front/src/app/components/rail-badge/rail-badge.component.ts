import {Component, computed, input} from '@angular/core';

export type RailNetwork = 'bitcoin' | 'lightning' | 'starknet';

const SHORT_CODES: Record<RailNetwork, string> = {
  bitcoin: 'BTC',
  lightning: 'LN',
  starknet: 'SN',
};

@Component({
  selector: 'app-rail-badge',
  standalone: true,
  imports: [],
  templateUrl: './rail-badge.component.html',
  styleUrl: './rail-badge.component.scss',
})
export class RailBadgeComponent {
  readonly network = input.required<RailNetwork>();
  readonly shortCode = computed(() => SHORT_CODES[this.network()]);
}
