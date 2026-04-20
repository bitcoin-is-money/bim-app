import type {AfterViewInit, ElementRef} from '@angular/core';
import {Component, computed, input, output, signal, viewChild} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';
import {SpinnerComponent} from '../spinner/spinner.component';

const CONFIRM_THRESHOLD_PERCENT = 70;
const HOLD_TO_CONFIRM_MS = 1000;
const HAPTIC_MS = 20;

type Mode = 'slide' | 'hold';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

@Component({
  selector: 'app-slide-to-confirm',
  standalone: true,
  imports: [FaIconComponent, TranslateModule, SpinnerComponent],
  templateUrl: './slide-to-confirm.component.html',
  styleUrl: './slide-to-confirm.component.scss',
})
export class SlideToConfirmComponent implements AfterViewInit {
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly labelKey = input<string>('payConfirm.slideToPay');
  readonly confirmed = output();

  readonly mode = signal<Mode>(prefersReducedMotion() ? 'hold' : 'slide');
  readonly thumbX = signal(0);
  readonly holdProgress = signal(0);
  readonly dragging = signal(false);
  readonly consumed = signal(false);

  readonly maxTrackPx = signal(0);

  readonly progress = computed(() => {
    if (this.mode() === 'hold') return this.holdProgress();
    const max = this.maxTrackPx();
    if (max <= 0) return 0;
    return (this.thumbX() / max) * 100;
  });

  private readonly trackRef = viewChild.required<ElementRef<HTMLDivElement>>('track');
  private readonly thumbRef = viewChild.required<ElementRef<HTMLDivElement>>('thumb');
  private holdStart = 0;
  private holdFrame: number | undefined;

  ngAfterViewInit(): void {
    this.measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => { this.measure(); });
      observer.observe(this.trackRef().nativeElement);
    }
  }

  private measure(): void {
    const track = this.trackRef().nativeElement;
    const thumb = this.thumbRef().nativeElement;
    this.maxTrackPx.set(Math.max(0, track.clientWidth - thumb.clientWidth - 12));
  }

  maxX(): number {
    this.measure();
    return this.maxTrackPx();
  }

  private trackLeft(): number {
    return this.trackRef().nativeElement.getBoundingClientRect().left + 6;
  }

  onPointerDown(event: PointerEvent): void {
    if (this.disabled() || this.consumed() || this.loading()) return;
    if (this.mode() === 'hold') {
      this.startHold(event);
      return;
    }
    this.dragging.set(true);
    this.trackRef().nativeElement.setPointerCapture(event.pointerId);
    this.updateThumb(event.clientX);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.mode() !== 'slide') return;
    if (!this.dragging()) return;
    this.updateThumb(event.clientX);
  }

  onPointerUp(_event: PointerEvent): void {
    if (this.mode() === 'hold') {
      this.endHold();
      return;
    }
    if (!this.dragging()) return;
    this.dragging.set(false);

    if (this.progress() >= CONFIRM_THRESHOLD_PERCENT) {
      this.thumbX.set(this.maxTrackPx());
      this.fire();
    } else {
      this.thumbX.set(0);
    }
  }

  private updateThumb(clientX: number): void {
    const max = this.maxX();
    const x = Math.max(0, Math.min(clientX - this.trackLeft(), max));
    this.thumbX.set(x);
  }

  private startHold(event: PointerEvent): void {
    this.trackRef().nativeElement.setPointerCapture(event.pointerId);
    this.holdStart = performance.now();
    this.dragging.set(true);
    const tick = (): void => {
      if (!this.dragging()) return;
      const elapsed = performance.now() - this.holdStart;
      const pct = Math.min(100, (elapsed / HOLD_TO_CONFIRM_MS) * 100);
      this.holdProgress.set(pct);
      if (pct >= 100) {
        this.holdProgress.set(100);
        this.fire();
        return;
      }
      this.holdFrame = requestAnimationFrame(tick);
    };
    this.holdFrame = requestAnimationFrame(tick);
  }

  private endHold(): void {
    this.dragging.set(false);
    if (this.holdFrame !== undefined) cancelAnimationFrame(this.holdFrame);
    if (this.holdProgress() < 100) this.holdProgress.set(0);
  }

  private fire(): void {
    if (this.consumed()) return;
    this.consumed.set(true);
     
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(HAPTIC_MS);
    }
    this.confirmed.emit();
  }
}
