import {Injectable, TemplateRef} from '@angular/core';
import {IconProp} from "@fortawesome/fontawesome-svg-core";
import {HotToastService, ToastOptions} from '@ngxpert/hot-toast';
import {Observable} from "rxjs";

const DEFAULT_OPTIONS: ToastOptions<unknown> = {
  duration: 400000,
  position: 'top-center'
}

export interface NotificationData {
  message: string;
  icon?: IconProp;
}

/**
 * Doc: https://ngxpert.github.io/hot-toast/
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {

  private toastTemplate?: TemplateRef<unknown>;

  constructor(
    private readonly toast: HotToastService
  ) {}

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
  }

  error(
    data: NotificationData,
    options?: ToastOptions<unknown>
  ) {
    this.show(data, {
      ...DEFAULT_OPTIONS,
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
    this.toast.show(this.toastTemplate, {
      ...options,
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
