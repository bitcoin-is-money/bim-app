---
name: angular-patterns
description: Guide for Angular 21 patterns in the BIM frontend. This skill should be used when creating components, services, pages, guards, pipes, interceptors, or working with the Angular frontend in apps/front.
---

# Angular Patterns

## Directory Structure

```
apps/front/src/app/
  components/       # Shared reusable UI (button, spinner, amount-field, etc.)
  interceptor/      # HTTP interceptors
  layout/           # Layout components
  mocks/            # Mock backend interceptor + handlers
  model/            # Interfaces and value objects
  pages/            # Route-level components (auth, home, pay, receive, etc.)
  pipes/            # Custom pipes
  services/         # Injectable services
assets/i18n/        # en.json, fr.json
environments/       # Environment configs
```

## Naming Conventions

| Type | Class | File | Selector |
|------|-------|------|----------|
| Page | `HomePage` | `home.page.ts` | `app-home` |
| Component | `ButtonComponent` | `button.component.ts` | `app-button` |
| Pipe | `FormatAmountPipe` | `format-amount.pipe.ts` | -- |
| State Service | `AuthService` | `auth.service.ts` | -- |
| HTTP Service | `AuthHttpService` | `auth.http.service.ts` | -- |

## Service Architecture: HTTP + State

```typescript
// HTTP layer: raw API calls, returns Observables
@Injectable({ providedIn: 'root' })
export class AuthHttpService {
  private readonly http = inject(HttpClient);
  beginRegister(username: string): Observable<BeginRegisterResponse> {
    return this.http.post<BeginRegisterResponse>('/api/auth/register/begin', { username });
  }
}

// State layer: orchestration + signals
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly httpService = inject(AuthHttpService);
  currentUser = signal<Account | null>(null);
  isLoading = signal(false);

  async signUp(username: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const begin = await firstValueFrom(this.httpService.beginRegister(username));
      // WebAuthn ceremony + complete registration + navigate
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) this.notifications.error({ message: error.message });
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

## Signals

- Observables for HTTP calls (`HttpClient`), Signals for state
- Bridge: `firstValueFrom()` (never `toPromise()`)

## Component Pattern

All standalone (no NgModule). Use `inject()` (not constructor injection).

```typescript
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule, AmountHighlightComponent, ButtonComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  private readonly authService = inject(AuthService);
  readonly accountService = inject(AccountService);
  ngOnInit(): void { this.loadData(); }
}
```

Inputs: `@Input({ required: true })` with `!` assertion for required, default values for optional.

## Routing

```typescript
export const routes: Routes = [
  { path: 'auth', loadComponent: () => import('./pages/auth/auth.page').then(m => m.AuthPage), canActivate: [guestGuard] },
  { path: 'home', loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage), canActivate: [authGuard] },
  { path: '', redirectTo: '/auth', pathMatch: 'full' },
];
```

Guards are inline functions using `inject()`:
```typescript
const authGuard = () => {
  const user = inject(AuthService).currentUser();
  if (!user) { inject(Router).navigate(['/auth']); return false; }
  return true;
};
```

## HTTP Error Handling

`httpNotificationInterceptor`: catches `HttpErrorResponse`, translates `ApiErrorResponse` via i18n, shows toast.

Suppress per-request: `new HttpContext().set(SUPPRESS_ERROR_NOTIFICATION, true)`.

## Model Layer (`model/`)

- Interfaces for API response shapes (sync with backend types)
- Classes only for value objects with behavior (`Amount`)
- `ErrorCode` mirrors `packages/domain/src/shared/error-codes.ts` (source of truth)

## Mock Backend

`mocks/backend.interceptor.ts`: intercepts `/api/*`, routes to mock handlers, adds delay. Toggled via `environment.useMockBackend`. Handlers in `mocks/<domain>/<domain>-handler.mock.ts`.

Core of the mock strategy: `DataStoreMock` (persisted in localStorage) + `mock-users.ts` (persona definitions). All mock handlers read/write from `DataStoreMock`, personas define pre-configured user profiles for different scenarios.

## Icons

FontAwesome via `@fortawesome/angular-fontawesome`. All icons must be registered in `icon.ts` before use. To add a new icon: import it in `icon.ts`, then use `fa-icon` or FontAwesome classes (`fas ...`) in templates.

## i18n

```html
{{ 'receive.enterAmount' | translate }}
```
```typescript
const i18n = inject(I18nService);
i18n.t('key'); i18n.translateError(apiError);
```

## App Config

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([httpNotificationInterceptor, backendInterceptor])),
    provideRouter(routes),
    provideHotToastConfig({ ... }),
    provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
  ],
};
```

Main libraries: `@ngx-translate/core`, `@ngxpert/hot-toast`, `@fortawesome/angular-fontawesome`, `uqr`.

## New Page Checklist

1. `pages/<name>/<name>.page.ts` (standalone), `.html`, `.scss`
2. Route in `app.routes.ts` (lazy load + guard)
3. HTTP service + state service if needed
4. Model interfaces in `model/`
5. Mock handler in `mocks/<domain>/`
6. Translations in `assets/i18n/en.json`

## New Component Checklist

1. `components/<name>/<name>.component.ts` (standalone), `.html`, `.scss`
2. `@Input()`/`@Output()` for API
3. Import in consuming components
4. Co-located test: `<name>.component.test.ts`
