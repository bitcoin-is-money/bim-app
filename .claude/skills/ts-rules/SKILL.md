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
| No inline `import()` types | Use top-level `import type` statements, never `param: import('./types').Foo` |
| No direct `as` casts | Branded types via `Type.of()` factory only |
| Explicit return types | Required on all exported functions |
| Strict mode | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Optional field assignment | Extract to a variable, then conditional spread: `const x = getX();` → `...(x !== undefined && {x})` |
| Collections | Type annotation on left: `const map: Map<K,V> = new Map()` |
| Runtime validation | Only at external boundaries (API input, DB, env vars) — trust the type system internally |
| Discriminated unions | Narrow with `if (x.status === 'ok')` before accessing variant fields |
| BigInt literals | Use `_` separators: `100_000n` |
| Error assertions | `toThrow(SpecificDomainError)` not `toThrow(Error)` |
| Nullish defaults | `x ?? 'default'` not `x \|\| 'default'` — `\|\|` also overrides `''`, `0`, `false` |

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
| File length | Max 200 lines (no limit for interface-grouping files like domain ports) |
| Nesting depth | Max 3 levels, early returns preferred |
| Parameters | >2 → each on own line |
| File scope | One concern per file |
| Generic code | Domain-agnostic → `packages/lib`, test utils → `@bim/test-toolkit` |
| Deps interfaces | `Pick<Deps, ...>` when including fewer, `Omit<Deps, ...>` when excluding fewer. Never `& { ... }` to extend |

## Comments

Only two forms of comments are allowed:

Single or multi-line JSDoc above classes/interfaces:
```typescript
/**
 * Explains something that needs
 * more than one line.
 */
```

Inline `//` inside a function body for complex context:
```typescript
function claim(swap: Swap): void {
  // Atomiq requires the preimage before the timeout, otherwise funds are lost
  sendPreimage(swap.preimage);
}
```

No other comment styles (`/* */`, single-line `/** */`, bare multi-line without `*` prefix).

## Field Access

| Pattern | Rule |
|---------|------|
| Immutable fields | `readonly` (no getter needed) |
| Mutable fields | `private` + explicit methods |
| JS getters/setters | **Banned** |
| `_`-prefixed fields | **Banned** |

## Error Handling

```typescript
// Domain errors carry their own ErrorCode and i18n args
export class FooNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.FOO_NOT_FOUND;
  constructor(readonly fooId: FooId) { super(`Foo not found: ${fooId}`); }
  override get args() { return {fooId: this.fooId}; }
}

// Serialize unknown errors safely (never use String(err))
import {serializeError} from '@bim/lib/error';
catch (err: unknown) {
  logger.warn({cause: serializeError(err)}, 'Operation failed');
}
```

Route errors via `handleDomainError()` in `apps/api/src/errors/error-handler.ts`. The handler uses a `Map<ErrorCode, ErrorStatus>` — add new error codes there, not instanceof checks.

## Accepted Patterns

| Pattern | Rationale                                                                                                                                                                             |
|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Simple one-shot `setTimeout` without `clearTimeout`/cleanup | Short fire-and-forget timers are harmless if the component is destroyed before they fire. Only add cleanup for long-lived or recurring timers (`setInterval`, repeated `setTimeout`). |
| `console.error` in a silent catch block (frontend only) | When a catch block intentionally swallows an error (no rethrow), `console.error` is acceptable to preserve observability. This applies to frontend code where there is no Pino logger. `console.log` for debugging remains forbidden. |

## Dependencies

| Rule | Detail |
|------|--------|
| Prefer libraries over hand-rolled code | Always use a well-maintained library even for small utilities. Do not reinvent the wheel. |
| Heavy transitive deps | If the library pulls in many transitive dependencies, ask the user before adding it. |

## Lint Gotchas

Patterns that repeatedly trip the lint config. Write the good form from the start.

| Pitfall | Good form |
|---------|-----------|
| Empty arrow `() => {}` | `() => { /* clear explanation */ }` — bare empty body trips `no-empty-function`. The comment **must explain intent**; `/* no-op */` is fine when the no-op is obvious from context, but prefer a precise reason. |
| Duplicate `import type` from same module | Merge: `import type {A, B} from 'x'` |
| Unbounded regex `\d+` on user input | Bounded quantifier `\d{1,8}` — avoid nested quantifiers, satisfies `safe-regex` |
| Bare `// eslint-disable-next-line rule` | Always add a `-- reason` suffix: `// eslint-disable-next-line rule -- why this is safe here` |
| `arr[0]` with `noUncheckedIndexedAccess` | Destructure with guard: `const [first] = arr; if (!first) return;` — or `arr[0]!` only if provably non-empty |

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
| `process.env.X!` non-null assertion | `const x = process.env.X; if (!x) throw new Error('X is required');` |
| `Record<K,V>` indexed with a variable | `Map<K,V>` **or** literal-branch helper (`network === 'mainnet' ? X.mainnet : X.testnet`) — avoids `security/detect-object-injection` |
| `String(unknown)` or `err instanceof Error ? err.message : String(err)` | Use `serializeError(err)` from `@bim/lib/error` |
| `async` without `await` | Drop `async`, return `Promise.resolve()` if the type requires a Promise |
| `Function` type / `& Function` | `NonNullable<NonNullable<T['k']>['sub']>` or a precise signature |
| Pass-through subclass constructor | Delete it — let the parent constructor be inherited (make parent `public`) |
