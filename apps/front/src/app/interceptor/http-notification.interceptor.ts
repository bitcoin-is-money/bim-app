import {HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest} from '@angular/common/http';
import {inject} from '@angular/core';
import {catchError, throwError} from 'rxjs';
import {getErrorMessage, isApiErrorResponse} from '../model';
import {NotificationService} from '../services/notification.service';

export const httpNotificationInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((response: HttpErrorResponse) => {
      // Extract message from the new API error format
      let message: string;

      if (isApiErrorResponse(response.error)) {
        // New format: { error: { code, message, args? } }
        message = getErrorMessage(response.error);
      } else if (response.error?.error?.message) {
        // Legacy format: { error: { message } }
        message = response.error.error.message;
      } else if (response.error?.message) {
        // Simple format: { message }
        message = response.error.message;
      } else {
        message = response.message || 'An error occurred';
      }

      if (response.status >= 400 && response.status < 500) {
        notifications.error({message});
      } else if (response.status >= 500) {
        notifications.error({message: 'Server error, please try later.'});
      }

      return throwError(() => response);
    })
  );
};
