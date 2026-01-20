import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { backendInterceptor } from './mocks';
import { routes } from './app.routes';

const httpProviders = environment.useMockBackend
  ? provideHttpClient(withInterceptors([backendInterceptor]))
  : provideHttpClient();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    httpProviders,
    provideRouter(routes),
  ],
};
