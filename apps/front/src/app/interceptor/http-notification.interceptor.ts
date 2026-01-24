import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import {NotificationService} from "../services/notification.service";

@Injectable()
export class HttpNotificationInterceptor implements HttpInterceptor {
  constructor(
    private readonly notifications: NotificationService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status >= 400 && error.status < 500) {
          this.notifications.error(error.error?.message || 'An error occurred.');
        } else if (error.status >= 500) {
          this.notifications.error({message: 'Server error, please try later.'});
        }
        return throwError(() => error);
      })
    );
  }
}
