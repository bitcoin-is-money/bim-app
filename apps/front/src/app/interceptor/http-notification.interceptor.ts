import type {HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest} from '@angular/common/http';
import {HttpContextToken} from '@angular/common/http';
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

      /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- response.error is `any` (HttpErrorResponse) */
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
      /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

      if (response.status >= 400 && response.status < 500) {
        console.warn(`[API ${response.status}] ${message}`, response.error);
        // Dedupe 401s: parallel requests on an expired session would otherwise
        // each push an identical "session expired" toast.
        const id = response.status === 401 ? 'session-expired' : undefined;
        notifications.error({message, ...(id !== undefined && {id})});
      } else if (response.status >= 500) {
        // Use translated message when available (e.g. PAYMASTER_SERVICE_ERROR),
        // fallback to generic INTERNAL_ERROR only for unstructured responses
        const hasStructuredError = isApiErrorResponse(response.error);
        notifications.error({message: hasStructuredError ? message : i18n.t('errors.INTERNAL_ERROR')});
      }

      return throwError(() => response);
    })
  );
};
