import {Component, computed, input} from '@angular/core';

const NETWORK_LOGOS: Record<string, string> = {
  lightning: '/network-lightning.png',
  bitcoin: '/network-bitcoin.png',
  starknet: '/network-starknet.png',
};

@Component({
  selector: 'app-network-logo',
  standalone: true,
  imports: [],
  templateUrl: './network-logo.component.html',
  styleUrl: './network-logo.component.scss',
})
export class NetworkLogoComponent {
  network = input.required<string>();
  style = input<string>('');

  src = computed(() => NETWORK_LOGOS[this.network()] ?? '');
  alt = computed(() => `${this.network()} logo`);
}
