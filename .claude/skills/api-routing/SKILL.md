---
name: api-routing
description: Guide for API routing patterns in the BIM project. This skill should be used when creating Hono routes, Zod validation schemas, error handling, middleware, or working with the AppContext dependency injection container.
---

# API Routing

## Route File Structure

```
apps/api/src/routes/<context>/
  <context>.routes.ts     # Route factory
  <context>.schemas.ts    # Zod validation
  <context>.types.ts      # Response interfaces
```

## Route Factory Pattern

```typescript
export function createAuthRoutes(appContext: AppContext): Hono {
  const app = new Hono();
  const log = appContext.logger.child({ name: 'auth.routes.ts' });
  const { auth: authService } = appContext.services;

  app.post('/register/begin', async (honoCtx): Promise<TypedResponse<BeginRegistrationResponse | ApiErrorResponse>> => {
    try {
      const body = await honoCtx.req.json();
      const input = BeginRegistrationSchema.parse(body);
      const result = await authService.beginRegistration({ username: input.username });
      return honoCtx.json<BeginRegistrationResponse>({ ... });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
```

**Conventions:** Factory receives `AppContext`, returns `Hono`. Child logger per file. Destructure services at top. Every handler: explicit `Promise<TypedResponse<T | ApiErrorResponse>>` return type, `try/catch` with `handleDomainError`.

## Authenticated Routes

```typescript
export function createPayRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();
  app.post('/parse', async (honoCtx) => {
    const account = honoCtx.get('account');  // Typed via AuthenticatedContext
    const session = honoCtx.get('session');
  });
  return app;
}
```

`AuthenticatedHono` = `Hono<{ Variables: AuthenticatedContext }>` (defined in `apps/api/src/types.ts`).

## Zod Schemas

**MANDATORY:** Every route context that accepts input (body, query params, path params) MUST have a dedicated `<context>.schemas.ts` file. No inline `z.object(...)` in route files.

In `<context>.schemas.ts`. Reuse domain validation patterns:

```typescript
export const usernameSchema = z.string().regex(Username.PATTERN, '3-20 chars, alphanumeric + underscores');
export const BeginRegistrationSchema = z.object({ username: usernameSchema });
```

Parse at route boundary: `Schema.parse(await honoCtx.req.json())`. ZodError handled by `handleDomainError`.

## Response Types

In `<context>.types.ts`. Plain interfaces, `string | null` for optional fields, domain objects serialized.

## Error Handling

Centralized in `apps/api/src/errors/error-handler.ts`. Each `DomainError` carries its own `errorCode` and `args`. The handler uses a `Map<ErrorCode, ErrorStatus>` for HTTP mapping — no instanceof cascade.

```typescript
// To add a new error: just define errorCode on your DomainError subclass.
// Only add to HTTP_STATUS map if the status is NOT 400 (the default).
const HTTP_STATUS: ReadonlyMap<ErrorCode, ErrorStatus> = new Map([
  [ErrorCode.ACCOUNT_NOT_FOUND, 404],
  [ErrorCode.UNAUTHORIZED, 401],
  // ... non-400 mappings only
]);
```
```

Direct error responses for non-domain errors:
```typescript
if (!senderAddress) return createErrorResponse(honoCtx, 400, ErrorCode.ACCOUNT_NOT_DEPLOYED, 'Account not deployed');
```

### Error Code Categories

| Category | Examples |
|----------|---------|
| Auth | `AUTHENTICATION_FAILED`, `CHALLENGE_EXPIRED`, `SESSION_EXPIRED` |
| Account | `ACCOUNT_NOT_FOUND`, `ACCOUNT_ALREADY_EXISTS`, `INVALID_ACCOUNT_STATE` |
| Swap | `SWAP_NOT_FOUND`, `SWAP_EXPIRED`, `SWAP_AMOUNT_OUT_OF_RANGE` |
| Payment | `PAYMENT_PARSING_ERROR`, `INVALID_PAYMENT_AMOUNT`, `SAME_ADDRESS_PAYMENT` |
| Balance | `INSUFFICIENT_BALANCE`, `INSUFFICIENT_BALANCE_WITH_AMOUNT` |
| Generic | `VALIDATION_ERROR`, `UNAUTHORIZED`, `INTERNAL_ERROR`, `EXTERNAL_SERVICE_ERROR` |

## Auth Middleware

```typescript
app.use('/api/account/*', authMiddleware);
app.use('/api/payment/*', authMiddleware);
app.use('/api/user/*', authMiddleware);
app.use('/api/swap/*', authMiddleware);
```

Extracts session cookie -> validates via `sessionService.validate()` -> sets `account`/`session` on context -> 401 on failure.

## AppContext (DI Container)

```typescript
export interface AppContext {
  repositories: { account, session, challenge, swap, userSettings, transaction };
  gateways: { webAuthn, starknet, paymaster, atomiq, dex, lightningDecoder };
  services: { account, auth, session, swap, userSettings, transaction, pay, receive };
  starknetConfig: StarknetConfig;
  webauthn: { rpId, rpName, origin };
  logger: Logger;
}
```

Creation: `AppContext.createDefault(config, db, rootLogger, overrides)`.

## Adapters

Implement domain ports in `apps/api/src/adapters/`. `persistence/` for repositories, `gateways/` for external services.

```typescript
// adapters/persistence/drizzle-account.repository.ts
export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly db: Database) {}

  async findById(id: AccountId): Promise<Account | undefined> {
    const row = await this.db.select().from(accountsTable)
      .where(eq(accountsTable.id, id)).limit(1).then(rows => rows[0]);
    return row ? this.toDomain(row) : undefined;
  }

  private toRow(account: Account): AccountRow { ... }
  private toDomain(row: AccountRow): Account { ... }
}
```

## New Endpoint Checklist

1. Response interface in `<context>.types.ts`
2. Zod schema in `<context>.schemas.ts`
3. Handler in `<context>.routes.ts` (try/catch + handleDomainError)
4. If HTTP status is not 400, add ErrorCode to `HTTP_STATUS` map in `error-handler.ts`
5. Mount with auth middleware if needed
6. Integration test in `apps/api/test/integration/`
