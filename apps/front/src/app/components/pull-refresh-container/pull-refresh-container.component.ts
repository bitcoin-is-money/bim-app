import {Component, ElementRef, inject, input, output, signal} from '@angular/core';
import {ProgressBarComponent} from '../progress-bar/progress-bar.component';

const THRESHOLD = 20;
const MAX_PULL = 80;
const DAMPING = 120;

export class PullRefreshEvent {
  constructor(
    private readonly callback: () => void
  ) {}
  complete(): void { this.callback(); }
}

@Component({
  selector: 'app-pull-refresh-container',
  standalone: true,
  imports: [ProgressBarComponent],
  templateUrl: './pull-refresh-container.component.html',
  styleUrl: './pull-refresh-container.component.scss',
})
export class PullRefreshContainerComponent {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly disabled = input(false);
  readonly refreshRequest = output<PullRefreshEvent>();
  readonly pullDistance = signal(0);
  readonly isRefreshing = signal(false);
  readonly isSnapping = signal(false);

  private startY: number | null = null;
  private pulling = false;

  onTouchStart(e: TouchEvent): void {
    if (this.disabled()) return;
    const touch = e.touches[0];
    if (touch && this.el.nativeElement.scrollTop === 0) {
      this.startY = touch.clientY;
    }
  }

  onTouchMove(e: TouchEvent): void {
    if (this.startY === null) return;
    const touch = e.touches[0];
    if (!touch) return;

    const delta = touch.clientY - this.startY;
    if (delta > 0) {
      this.pulling = true;
      e.preventDefault();
      this.pullDistance.set(MAX_PULL * (1 - Math.exp(-delta / DAMPING)));
    } else if (this.pulling) {
      this.pulling = false;
      this.startY = null;
      this.snapBack();
    }
  }

  private snapBack(): void {
    this.isSnapping.set(true);
    requestAnimationFrame(() => { this.pullDistance.set(0); });
    setTimeout(() => { this.isSnapping.set(false); }, 500);
  }

  onTouchEnd(): void {
    if (this.startY === null && !this.pulling) return;
    this.startY = null;
    this.pulling = false;

    if (this.pullDistance() >= THRESHOLD && !this.isRefreshing()) {
      this.isRefreshing.set(true);
      this.snapBack();
      this.refreshRequest.emit(new PullRefreshEvent(() => { this.isRefreshing.set(false); }));
    } else {
      this.snapBack();
    }
  }
}
