---
name: ts-rules
description: Guide for TypeScript coding conventions. This skill should be used when writing TypeScript code, reviewing code quality, defining types, handling errors, or ensuring code follows project standards.
---

# TypeScript Rules

Rules and conventions for writing TypeScript code in this project.

---

## Core Philosophy

### Let TypeScript Do The Work

**DON'T** write runtime checks that TypeScript can enforce at compile time:

```typescript
// ❌ BAD - redundant check
function createUser(input: { username: string }) {
  if (!input.username) throw new Error('Username required'); // USELESS!
}

// ✅ GOOD - Trust the type system
function createUser(input: { username: string }) {
  return { id: generateId(), username: input.username };
}
```

**Runtime validation is only needed for:**
1. External data (API inputs, DB results, env vars)
2. Invariants that can't be expressed in types (e.g., "age must be positive")

### Prefer Simple Over Clever

Choose the simplest construct that works:
1. **Type alias** → for simple shapes
2. **Interface** → for object contracts
3. **Function** → for transformations
4. **Class** → only when you need encapsulated state and behavior

### Early Returns

Prefer early returns over nested conditions:

```typescript
// ❌ BAD - Nested conditions
function processOrder(order: Order): Result {
  if (order) {
    if (order.isValid()) {
      if (order.hasItems()) {
        return doProcess(order);
      }
    }
  }
  return { error: 'Invalid order' };
}

// ✅ GOOD - Early returns
function processOrder(order: Order): Result {
  if (!order) return { error: 'No order' };
  if (!order.isValid()) return { error: 'Invalid order' };
  if (!order.hasItems()) return { error: 'Empty order' };

  return doProcess(order);
}
```

### Size Limits

- **Functions:** max 50 lines
- **Files:** max 200 lines (split if exceeded)
- **Nesting depth:** max 3 levels

---

## Type System Rules

### Strict Mode (Mandatory)

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Non-Nullable by Default

```typescript
// ❌ BAD - Optional when it shouldn't be
interface User {
  username?: string;  // Why optional?
}

// ✅ GOOD - Required fields are required
interface User {
  username: string;
  bio?: string;  // Only optional if truly optional
}
```

### Use `undefined` for Absence, Never `null`

```typescript
// ❌ BAD
function findUser(id: string): User | null { ... }

// ✅ GOOD
function findUser(id: string): User | undefined { ... }
```

### Value Objects & Branded Types

Domain primitives MUST be defined as branded types with a namespace:

```typescript
type AccountId = string & { readonly __brand: 'AccountId' };

namespace AccountId {
  export function of(value: string): AccountId {
    if (!isValidAccountId(value)) {
      throw new InvalidAccountIdError(value);
    }
    return value as AccountId;
  }
}

// USAGE:
const id = AccountId.of(input.accountId);
```

**Rules:**
- Create via factory functions (`of`)
- Factories MUST validate all business invariants
- No value object may exist in an invalid state
- Direct casts (`as Xxx`) forbidden outside namespace

### Explicit Variable Naming

Variable names MUST be explicit and descriptive. Single-letter names are forbidden.

```typescript
// ❌ BAD
for (let i = 0; i < items.length; i++) { ... }
const c = getContext();

// ✅ GOOD
for (let itemIdx = 0; itemIdx < items.length; itemIdx++) { ... }
const ctx = getContext();

// ❌ BAD - Same name after transformation
const publicKey = encodeBase64(something.publicKey);

// ✅ GOOD - Different names for different representations
const publicKeyBytes = input.publicKey;
const encodedPublicKey = encodeBase64(publicKeyBytes);
```

### Semantic Types for Encoded Values

```typescript
// ❌ BAD - Plain string loses semantic information
interface Credential {
  id: string;
  publicKey: string;
}

// ✅ GOOD - Use semantic types
import type { Base64URLString } from '@simplewebauthn/types';

interface Credential {
  id: Base64URLString;
  publicKey: Base64URLString;
}
```

### Discriminated Unions for States

```typescript
type SwapState =
  | { status: 'pending' }
  | { status: 'confirmed'; txHash: string }
  | { status: 'failed'; error: string };

function handleSwap(swap: SwapState) {
  switch (swap.status) {
    case 'pending': return 'Waiting...';
    case 'confirmed': return `TX: ${swap.txHash}`;
    case 'failed': return `Error: ${swap.error}`;
  }
}
```

### Explicit Return Types

Return types MUST be explicitly specified:

```typescript
// ❌ BAD
export function getCreateAccountUseCase(deps: CreateAccountDeps) {
  return (input: CreateAccountInput) => service.execute(input);
}

// ✅ GOOD
export function getCreateAccountUseCase(deps: CreateAccountDeps) {
  return (input: CreateAccountInput): Promise<CreateAccountOutput> => service.execute(input);
}
```

### Explicit Type Annotations for Collections

```typescript
// ❌ BAD - Type in constructor generic
const mapVar = new Map<string, Swap>();

// ✅ GOOD - Explicit type annotation on the left
const mapVar: Map<string, Swap> = new Map();
const arrVar: Item[] = [];
```

---

## Field Access: Immutable vs Mutable

- Fields that **never change** → `readonly` (no getter needed)
- Fields that **can change** → `private` with explicit methods
- JS/TS getter/setter syntax is **banned**
- `_`-prefixed fields are **banned**

```typescript
export class Account {
  private status: AccountStatus;

  constructor(
    readonly id: AccountId,
    readonly username: string,
  ) {
    this.status = 'pending';
  }

  getStatus(): AccountStatus {
    return this.status;
  }

  markAsDeployed(txHash: string): void {
    this.status = 'deployed';
  }
}
```

---

## Function & Constructor Formatting

- **More than two parameters** → each on its own line
- **Complex single parameter** → on its own line

```typescript
// ✅ GOOD
function sendEmail(
  to: Email,
  subject: string,
  body: string,
): void {
  // implementation
}

// ✅ GOOD
export class Service {
  constructor(
    private readonly deps: { repository: Repository },
  ) {}
}
```

---

## When to Use Classes vs Functions

### Classes: Entities with Identity and Lifecycle

```typescript
export class Account {
  private constructor(
    readonly id: AccountId,
    readonly username: string,
    private status: AccountStatus,
  ) {}

  static create(params: { id: AccountId; username: string }): Account {
    return new Account(params.id, params.username, 'pending');
  }

  markAsDeployed(txHash: string): void {
    this.status = 'deployed';
  }
}
```

### Functions + Types: Everything Else

```typescript
// Value Object
type Email = string & { readonly __brand: 'Email' };

namespace Email {
  export function of(value: string): Email {
    if (!isValid(value)) throw new InvalidEmailError(value);
    return value as Email;
  }
}

// Pure function
function calculateFee(amountSats: bigint): bigint {
  return amountSats * 5n / 1000n;
}
```

---

## Validation Strategy

### At Boundaries: Use Zod

```typescript
import { z } from 'zod';

const AccountSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
});

app.post('/accounts', async (c) => {
  const input = AccountSchema.parse(await c.req.json());
  return c.json(result);
});
```

### Use Parameter Objects

Prefer passing parameters as a single object instead of multiple positional arguments.

---

## Error Handling

### Custom Error Classes

```typescript
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AccountNotFoundError extends DomainError {
  constructor(readonly accountId: AccountId) {
    super(`Account not found: ${accountId}`);
  }
}
```

### Result Type (Optional)

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function parseEmail(value: string): Result<Email, InvalidEmailError> {
  if (!isValidEmail(value)) {
    return { ok: false, error: new InvalidEmailError(value) };
  }
  return { ok: true, value: value as Email };
}
```

### Typed Error Handling

```typescript
// ❌ BAD - Untyped catch
try {
  await doSomething();
} catch (e) {
  console.log(e.message);
}

// ✅ GOOD - Typed catch
try {
  await doSomething();
} catch (err: unknown) {
  if (err instanceof DomainError) {
    return { error: err.message };
  }
  throw err;
}
```

---

## Forbidden Patterns

- ❌ `any` type (use `unknown` + type guards)
- ❌ `null` (use `undefined`)
- ❌ Runtime null checks that TypeScript already guarantees
- ❌ Default exports
- ❌ `var` keyword
- ❌ Classes for simple data (use types/interfaces)
- ❌ `console.log` (use proper logger)
- ❌ Barrel files with circular dependencies
- ❌ `toPromise()` on observables (use `firstValueFrom()` or `lastValueFrom()` from RxJS)
- ❌ `string.replace(/pattern/g, ...)` for global replacements (use `string.replaceAll()` instead)

---

## Code Organization & Reusability

### Extract Generic Code to Libraries

- Domain-agnostic code (encoding, validation helpers) → `packages/lib`
- Generic test utilities → `@bim/test-toolkit`
- Check if a modern library exists before writing technical code

### Prefer Modern Libraries

Before implementing technical code (crypto, encoding, parsing):
1. Search for well-maintained, modern libraries
2. Prefer TypeScript support and ESM exports
3. Only implement manually if no suitable library exists

### Naming: Always Use camelCase

**All identifiers MUST use camelCase**, including string literals in tests:

```typescript
// ❌ BAD
const username = 'testuser';

// ✅ GOOD
const username = 'testUser';
```

### File Scope: One Concern Per File

- Avoid files with many unrelated types
- Each file should have a well-defined scope
- Split large type files by concern
- Co-locate types with their related entity/use-case
