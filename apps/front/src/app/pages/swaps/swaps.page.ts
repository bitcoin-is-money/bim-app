import type { OnInit} from '@angular/core';
import {Component, computed, inject, signal} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {ButtonComponent} from "../../components/button/button.component";
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from "../../layout";
import {isTerminalStatus} from '../../model';
import {SwapPollingService} from '../../services/swap-polling.service';
import {SwapStorageService} from '../../services/swap-storage.service';
import {SwapItemComponent} from './components/swap-item/swap-item.component';

@Component({
  selector: 'app-swaps',
  standalone: true,
  imports: [TranslateModule, GoBackHeaderComponent, SwapItemComponent, ButtonComponent, FullPageLayoutComponent],
  templateUrl: './swaps.page.html',
  styleUrl: './swaps.page.scss',
})
export class SwapsPage implements OnInit {
  private readonly storageService = inject(SwapStorageService);
  private readonly pollingService = inject(SwapPollingService);

  readonly swaps = computed(() => this.storageService.swaps());
  readonly isEmpty = computed(() => this.swaps().length === 0);
  readonly isRefreshing = signal(false);

  ngOnInit(): void {
    this.refreshAllStatuses();
  }

  refreshAllStatuses(): void {
    const swaps = this.storageService.swaps();
    if (swaps.length === 0) return;

    this.isRefreshing.set(true);

    const activeSwaps = swaps.filter((s) => !isTerminalStatus(s.lastKnownStatus));
    for (const swap of activeSwaps.slice(0, 20)) {
      this.pollingService.fetchStatusOnce(swap.id);
    }

    // Reset refreshing state after a short delay (mocks are async)
    setTimeout(() => { this.isRefreshing.set(false); }, 1000);
  }
}
