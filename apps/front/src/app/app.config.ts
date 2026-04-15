import {registerLocaleData} from '@angular/common';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import localeFr from '@angular/common/locales/fr';
import type {ApplicationConfig} from '@angular/core';
import {importProvidersFrom, inject, provideAppInitializer, provideBrowserGlobalErrorListeners} from '@angular/core';
import {provideRouter} from '@angular/router';
import {provideServiceWorker} from '@angular/service-worker';
import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';
import {provideTranslateHttpLoader} from '@ngx-translate/http-loader';
import {provideHotToastConfig} from '@ngxpert/hot-toast';
import {environment} from '../environments/environment';
import {registerIcons} from "../icons";
import {routes} from './app.routes';
import {authInterceptor} from './interceptor/auth.interceptor';
import {httpNotificationInterceptor} from "./interceptor/http-notification.interceptor";
import {backendInterceptor} from './mocks/backend.interceptor';
import {AuthService} from './services/auth.service';
import {PwaInstallService} from './services/pwa-install.service';

/**
 * Total time (ms) the splash animation needs to play out once revealed.
 * Matches the last meaningful keyframe in logo-cubes-animated.svg (74% of 5s)
 * plus a small safety buffer.
 */
const SPLASH_ANIMATION_MS = 3800;

interface SplashContext {
  pingPromise: Promise<unknown>;
  result: 'fast' | 'slow' | null;
  splashShownAt: number | null;
}

declare global {
  var __splashCtx: SplashContext | undefined;
}

// Interceptors run in order: first intercepts request first, but catches errors last
// So: httpNotificationInterceptor catches errors from backendInterceptor
const httpProviders = environment.useMockBackend
  ? provideHttpClient(withInterceptors([authInterceptor, httpNotificationInterceptor, backendInterceptor]))
  : provideHttpClient(withInterceptors([authInterceptor, httpNotificationInterceptor]));

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    httpProviders,
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideHotToastConfig({
      dismissible: true,
      autoClose: true,
    }),
    provideAppInitializer(async () => {
      await inject(PwaInstallService).init();
    }),
    provideAppInitializer(async () => {
      const ctx = globalThis.__splashCtx;
      if (!ctx) return;
      // Ensure the backend is reachable before running initializers that depend on it.
      await ctx.pingPromise;
    }),
    provideAppInitializer(async () => {
      const authService = inject(AuthService);
      await authService.loadCurrentUser();
    }),
    provideAppInitializer(() => {
      const library = inject(FaIconLibrary);
      registerIcons(library);
    }),
    provideAppInitializer(async () => {
      const ctx = globalThis.__splashCtx;
      if (!ctx) return;
      if (ctx.result === 'slow' && ctx.splashShownAt !== null) {
        const elapsed = performance.now() - ctx.splashShownAt;
        const remaining = Math.max(0, SPLASH_ANIMATION_MS - elapsed);
        if (remaining > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, remaining));
        }
      }
      document.getElementById('splash')?.remove();
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
