import {HttpContextToken, HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest} from '@angular/common/http';
import {inject, Injector} from '@angular/core';
import {catchError, throwError} from 'rxjs';
import {isApiErrorResponse} from '../model';
import {I18nService} from '../services/i18n.service';
import {NotificationService} from '../services/notification.service';

export const SUPPRESS_ERROR_NOTIFICATION = new HttpContextToken<boolean>(() => false);

export const httpNotificationInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const notifications = inject(NotificationService);
  // Lazy injection to avoid circular dependency:
  // TranslateHttpLoader → HttpClient → interceptor → I18nService → TranslateService → TranslateHttpLoader
  const injector = inject(Injector);

  return next(req).pipe(
    catchError((response: HttpErrorResponse) => {
      if (req.context.get(SUPPRESS_ERROR_NOTIFICATION)) {
        return throwError(() => response);
      }

      const i18n = injector.get(I18nService);
      let message: string;

      if (isApiErrorResponse(response.error)) {
        // Structured format: { error: { code, message, args? } } — translate via i18n
        message = i18n.translateError(response.error.error);
      } else if (response.error?.error?.message) {
        // Legacy format: { error: { message } }
        message = response.error.error.message;
      } else if (response.error?.message) {
        // Simple format: { message }
        message = response.error.message;
      } else {
        message = response.message || i18n.t('errors.INTERNAL_ERROR');
      }

      if (response.status >= 400 && response.status < 500) {
        notifications.error({message});
      } else if (response.status >= 500) {
        notifications.error({message: i18n.t('errors.INTERNAL_ERROR')});
      }

      return throwError(() => response);
    })
  );
};
