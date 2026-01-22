import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners} from '@angular/core';
import {provideRouter} from '@angular/router';
import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {environment} from '../environments/environment';
import {registerIcons} from "../icons";
import {routes} from './app.routes';
import {backendInterceptor} from './mocks';

const httpProviders = environment.useMockBackend
  ? provideHttpClient(withInterceptors([backendInterceptor]))
  : provideHttpClient();

export const
  appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    httpProviders,
    provideRouter(routes),
    provideAppInitializer(() => {
      const library = inject(FaIconLibrary);
      registerIcons(library);
    }),
  ],
};
