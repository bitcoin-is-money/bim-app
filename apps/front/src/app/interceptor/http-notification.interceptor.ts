import {HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest} from '@angular/common/http';
import {inject} from '@angular/core';
import {catchError, throwError} from 'rxjs';
import {NotificationService} from "../services/notification.service";

export const httpNotificationInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const message = error.error?.error?.message || error.message || 'An error occurred';
      if (error.status >= 400 && error.status < 500) {
        notifications.error({ message });
      } else if (error.status >= 500) {
        notifications.error({ message: 'Server error, please try later.' });
      }
      return throwError(() => error);
    })
  );
};

