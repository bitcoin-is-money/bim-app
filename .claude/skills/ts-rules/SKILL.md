---
name: ts-rules
description: Guide for TypeScript coding conventions. This skill should be used when writing TypeScript code, reviewing code quality, defining types, handling errors, or ensuring code follows project standards.
---

# TypeScript Rules

## Type System

| Rule | Detail |
|------|--------|
| No `any` | Use `unknown` + type guards |
| No `null` | Use `undefined` for absence |
| No direct `as` casts | Branded types via `Type.of()` factory only |
| Explicit return types | Required on all exported functions |
| Strict mode | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Collections | Type annotation on left: `const map: Map<K,V> = new Map()` |
| Runtime validation | Only at external boundaries (API input, DB, env vars) — trust the type system internally |
| Discriminated unions | Narrow with `if (x.status === 'ok')` before accessing variant fields |
| BigInt literals | Use `_` separators: `100_000n` |
| Error assertions | `toThrow(SpecificDomainError)` not `toThrow(Error)` |

## Branded Types

Project-specific pattern — one ✅ example:

```typescript
type AccountId = string & { readonly __brand: 'AccountId' };

namespace AccountId {
  export function of(value: string): AccountId {
    if (!isValidAccountId(value)) throw new InvalidAccountIdError(value);
    return value as AccountId; // cast allowed ONLY inside namespace
  }
}
```

## Naming

| Rule | Example |
|------|---------|
| camelCase everywhere (including test data) | `'testUser'` not `'testuser'` |
| Descriptive names, no single letters | `itemIdx` not `i`, `ctx` not `c` |
| No `utils`/`helpers`/`common` | Use domain-specific names |
| Different names for different representations | `publicKeyBytes` → `encodedPublicKey` |
| Semantic types for encoded values | `Base64URLString` not `string` |

## Code Organization

| Rule | Limit |
|------|-------|
| Function length | Max 50 lines |
| File length | Max 200 lines |
| Nesting depth | Max 3 levels, early returns preferred |
| Parameters | >2 → each on own line |
| File scope | One concern per file |
| Generic code | Domain-agnostic → `packages/lib`, test utils → `@bim/test-toolkit` |
| Deps interfaces | `Pick<Deps, ...>` when including fewer, `Omit<Deps, ...>` when excluding fewer. Never `& { ... }` to extend |

## Field Access

| Pattern | Rule |
|---------|------|
| Immutable fields | `readonly` (no getter needed) |
| Mutable fields | `private` + explicit methods |
| JS getters/setters | **Banned** |
| `_`-prefixed fields | **Banned** |

## Error Handling

```typescript
// Domain errors
export class FooNotFoundError extends DomainError {
  constructor(readonly fooId: FooId) { super(`Foo not found: ${fooId}`); }
}

// Typed catch
catch (err: unknown) {
  if (err instanceof DomainError) { /* handle */ }
  throw err;
}
```

Route errors via `handleDomainError()` in `apps/api/src/errors/error-handler.ts`.

## Accepted Patterns

| Pattern | Rationale                                                                                                                                                                             |
|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Simple one-shot `setTimeout` without `clearTimeout`/cleanup | Short fire-and-forget timers are harmless if the component is destroyed before they fire. Only add cleanup for long-lived or recurring timers (`setInterval`, repeated `setTimeout`). |
| `console.error` in a silent catch block (frontend only) | When a catch block intentionally swallows an error (no rethrow), `console.error` is acceptable to preserve observability. This applies to frontend code where there is no Pino logger. `console.log` for debugging remains forbidden. |

## Forbidden Patterns

| Forbidden | Use Instead |
|-----------|-------------|
| Default exports | Named exports |
| `var` | `const`/`let` |
| `console.log` | Pino logger |
| `string.replace(/g)` | `string.replaceAll()` |
| `toPromise()` | `firstValueFrom()`/`lastValueFrom()` |
| Classes for simple data | Types/interfaces |
| Barrel files with circular deps | Direct imports |
| Test-only methods in prod code | Test helpers in `test/helpers/` |
