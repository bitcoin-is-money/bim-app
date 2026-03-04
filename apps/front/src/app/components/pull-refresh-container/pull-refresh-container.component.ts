import {Component, ElementRef, inject, input, output, signal} from '@angular/core';
import {ProgressBarComponent} from '../progress-bar/progress-bar.component';

const THRESHOLD = 20;
const MAX_PULL = 50;

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
  private readonly el = inject(ElementRef<HTMLElement>);

  readonly disabled = input(false);
  readonly refreshRequest = output<PullRefreshEvent>();
  readonly pullDistance = signal(0);
  readonly isRefreshing = signal(false);

  private startY: number | null = null;
  private pulling = false;

  onTouchStart(e: TouchEvent): void {
    if (this.disabled() || this.isRefreshing()) return;
    const touch = e.touches[0];
    if (touch && this.el.nativeElement.scrollTop === 0) {
      this.startY = touch.clientY;
    }
  }

  onTouchMove(e: TouchEvent): void {
    if (this.startY === null || this.isRefreshing()) return;
    const touch = e.touches[0];
    if (!touch) return;

    const delta = touch.clientY - this.startY;
    if (delta > 0) {
      this.pulling = true;
      e.preventDefault();
      this.pullDistance.set(Math.min(delta, MAX_PULL));
    } else if (this.pulling) {
      this.pulling = false;
      this.startY = null;
      this.pullDistance.set(0);
    }
  }

  onTouchEnd(): void {
    if (this.startY === null && !this.pulling) return;
    this.startY = null;
    this.pulling = false;

    if (this.pullDistance() >= THRESHOLD) {
      this.isRefreshing.set(true);
      this.pullDistance.set(0);
      this.refreshRequest.emit(new PullRefreshEvent(() => this.isRefreshing.set(false)));
    } else {
      this.pullDistance.set(0);
    }
  }
}
