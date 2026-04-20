import type {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { CurrencyService } from '../services/currency.service';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const injector = inject(Injector);

  return next(req).pipe(
    catchError((response: HttpErrorResponse) => {
      if (response.status === 401) {
        const authService = injector.get(AuthService);
        authService.currentUser.set(null);
        const currencyService = injector.get(CurrencyService);
        currencyService.stop();
        const router = injector.get(Router);
        void router.navigate(['/auth']);
      }
      return throwError(() => response);
    }),
  );
};
