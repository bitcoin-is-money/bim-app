import type {TemplateRef} from '@angular/core';
import {inject, Injectable} from '@angular/core';
import type {IconProp} from "@fortawesome/fontawesome-svg-core";
import type {ToastOptions} from '@ngxpert/hot-toast';
import {HotToastService} from '@ngxpert/hot-toast';
import confetti from 'canvas-confetti';
import type {Observable} from "rxjs";

const DEFAULT_OPTIONS: ToastOptions<unknown> = {
  duration: 3000,
  position: 'top-center'
}

const DEFAULT_ERROR_OPTIONS: ToastOptions<unknown> = {
  ...DEFAULT_OPTIONS,
  duration: 10000,
}

export interface NotificationData {
  message: string;
  icon?: IconProp;
  useConfetti?: boolean
  /**
   * Stable id used by hot-toast to dedupe toasts.
   * A second `show()` with the same id updates the existing toast
   * instead of stacking a duplicate (e.g. parallel 401s on session expiration).
   */
  id?: string;
}

/**
 * Doc: https://ngxpert.github.io/hot-toast/
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly toast = inject(HotToastService);
  private toastTemplate?: TemplateRef<unknown>;

  registerTemplate(template: TemplateRef<unknown>) {
    this.toastTemplate = template;
  }

  success(
    data: NotificationData,
    options?: ToastOptions<unknown>
  ) {
    this.show(data, {
      ...DEFAULT_OPTIONS,
      ...options,
      className: 'hot-toast-success',
    });
    if (data.useConfetti) {
      void confetti({
        particleCount: 100,
        spread: 70,
        origin: {y: 0.4}
      });
    }
  }

  error(
    data: NotificationData,
    options?: ToastOptions<unknown>
  ) {
    this.show(data, {
      ...DEFAULT_ERROR_OPTIONS,
      ...options,
      className: 'hot-toast-error',
    });
  }

  info(
    data: NotificationData,
    options?: ToastOptions<unknown>
  ) {
    this.show(data, {
      ...DEFAULT_OPTIONS,
      ...options,
      className: 'hot-toast-info',
    });
  }

  show(
    data: NotificationData,
    options?: ToastOptions<unknown>
  ) {
    if (!this.toastTemplate) {
      console.warn('Toast template not registered');
      return;
    }
    this.toast.show(this.toastTemplate, {
      ...options,
      ...(data.id !== undefined && {id: data.id}),
      data: data
    });
  }

  observe<T>(
    observable$: Observable<T>,
    messages: { loading: string; success: string; error: string }
  ): Observable<T> {
    return observable$.pipe(this.toast.observe(messages));
  }

}
