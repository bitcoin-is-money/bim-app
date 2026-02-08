import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {ApplicationConfig, importProvidersFrom, inject, provideAppInitializer, provideBrowserGlobalErrorListeners} from '@angular/core';
import {provideRouter} from '@angular/router';
import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';
import {provideTranslateHttpLoader} from '@ngx-translate/http-loader';
import {provideHotToastConfig} from '@ngxpert/hot-toast';
import {environment} from '../environments/environment';
import {registerIcons} from "../icons";
import {routes} from './app.routes';
import {httpNotificationInterceptor} from "./interceptor/http-notification.interceptor";
import {backendInterceptor} from './mocks/backend.interceptor';

// Interceptors run in order: first intercepts request first, but catches errors last
// So: httpNotificationInterceptor catches errors from backendInterceptor
const httpProviders = environment.useMockBackend
  ? provideHttpClient(withInterceptors([httpNotificationInterceptor, backendInterceptor]))
  : provideHttpClient(withInterceptors([httpNotificationInterceptor]));

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    httpProviders,
    provideRouter(routes),
    provideHotToastConfig({
      dismissible: true,
      autoClose: true,
    }),
    provideAppInitializer(() => {
      const library = inject(FaIconLibrary);
      registerIcons(library);
    }),
    importProvidersFrom(
      TranslateModule.forRoot({
        fallbackLang: 'en'
      })
    ),
    provideTranslateHttpLoader({
      prefix: './assets/i18n/',
      suffix: '.json',
    }),
  ],
};
