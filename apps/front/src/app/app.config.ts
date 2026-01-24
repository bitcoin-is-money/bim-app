import {HTTP_INTERCEPTORS, provideHttpClient, withInterceptors} from '@angular/common/http';
import {ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners} from '@angular/core';
import {provideRouter} from '@angular/router';
import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {environment} from '../environments/environment';
import {registerIcons} from "../icons";
import {routes} from './app.routes';
import {HttpNotificationInterceptor} from "./interceptor/http-notification.interceptor";
import {backendInterceptor} from './mocks';
import { provideHotToastConfig } from '@ngxpert/hot-toast';

const httpProviders = environment.useMockBackend
  ? provideHttpClient(withInterceptors([backendInterceptor]))
  : provideHttpClient();

export const
  appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    httpProviders,
    provideRouter(routes),
    provideHotToastConfig({
      dismissible: true,
      autoClose: true,
    }),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpNotificationInterceptor,
      multi: true
    },
    provideAppInitializer(() => {
      const library = inject(FaIconLibrary);
      registerIcons(library);
    }),
  ],
};
