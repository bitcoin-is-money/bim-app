import type { TemplateRef} from '@angular/core';
import {inject, Injectable} from '@angular/core';
import type {IconProp} from "@fortawesome/fontawesome-svg-core";
import type { ToastOptions} from '@ngxpert/hot-toast';
import {HotToastService} from '@ngxpert/hot-toast';
import type {Observable} from "rxjs";
import confetti from 'canvas-confetti';

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
      style: {
        '--hot-toast-bg': '#67cc35',
        '--hot-toast-color': '#151515',
      },
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
      style: {
        '--hot-toast-bg': '#c83030',
        '--hot-toast-color': '#ffffff',
      },
    });
  }

  info(
    data: NotificationData,
    options?: ToastOptions<unknown>
  ) {
    this.show(data, {
      ...DEFAULT_OPTIONS,
      ...options,
      style: {
        '--hot-toast-bg': '#fff',
        '--hot-toast-color': '#151515',
      },
    });

    //icon: "fas qrcode"
  }

  show(
    data: NotificationData,
    options?: ToastOptions<unknown>
  ) {
    if (!this.toastTemplate) {
      console.warn('Toast template not registered');
      return;
    }
    setTimeout(() => {
      this.toast.show(this.toastTemplate, {
        ...options,
        data: data
      });
    });
  }

  observe<T>(
    observable$: Observable<T>,
    messages: { loading: string; success: string; error: string }
  ): Observable<T> {
    return observable$.pipe(this.toast.observe(messages));
  }

}
