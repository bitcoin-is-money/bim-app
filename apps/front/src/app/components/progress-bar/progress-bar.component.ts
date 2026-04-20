import { Component, effect, input, signal } from '@angular/core';

const CYCLE_DURATION_MS = 1200;

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  templateUrl: './progress-bar.component.html',
  styleUrl: './progress-bar.component.scss',
})
export class ProgressBarComponent {
  readonly active = input(false);
  readonly visible = signal(false);

  private cycleStart = 0;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const isActive = this.active();
      if (isActive) {
        this.clearHideTimeout();
        this.cycleStart = Date.now();
        this.visible.set(true);
      } else if (this.visible()) {
        this.scheduleHide();
      }
    });
  }

  private scheduleHide(): void {
    const elapsed = Date.now() - this.cycleStart;
    const remaining = CYCLE_DURATION_MS - (elapsed % CYCLE_DURATION_MS);
    this.hideTimeout = setTimeout(() => {
      this.visible.set(false);
    }, remaining);
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}
