# TypeScript Code Generator Command

## Purpose

Generate **production-ready TypeScript code** following:
- Hexagonal (Ports & Adapters) architecture
- TypeScript-first idioms
- Functional programming where appropriate
- Modern TypeScript with strict mode
- ESM only

This command is **strict and opinionated**.
It prioritizes type safety, simplicity, and maintainability.

---

## Core Philosophy

### Let TypeScript Do The Work

**DON'T** write runtime checks that TypeScript can enforce at compile time:

```typescript
// ❌ BAD - redundant check
function createUser(input: { username: string }) {
  if (!input.username) throw new Error('Username required'); // USELESS!
  // TypeScript already guarantees username is a string
}

// ✅ GOOD - Trust the type system
function createUser(input: { username: string }) {
  // TypeScript guarantees username is string, not undefined
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

Use `undefined` (not `null`) for absent values. This matches JS/TS semantics and avoids handling two different "no value" states.

```typescript
// ❌ BAD
function findUser(id: string): User | null { ... }

// ✅ GOOD
function findUser(id: string): User | undefined { ... }
```

### Value Objects & Branded Types

Domain primitives MUST be defined as branded types
and their creation logic MUST be grouped using a TypeScript `namespace`
with the same name as the type.

The namespace is the single authority for creating the value object.

Creation rules:

- Domain value objects MUST be created via explicit factory functions
  exposed by their namespace (e.g. `of`)
- Factories MUST validate all business invariants
- No value object may exist in an invalid state

Forbidden:

- Creating branded types via direct casts (`as Xxx`)
  outside of their namespace
- Creating domain primitives without validation
- Free-floating factory functions not attached to the type namespace

Optional:

- A namespace MAY expose an internal `assume` or `trusted` factory
  for already-validated data (e.g. database reads)
- Such functions MUST NOT be used at application boundaries
- Their usage MUST be rare and explicitly justified

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

### Explicit Variable Naming

Variable names MUST be explicit and descriptive. Single-letter names are forbidden.

**Rules:**
- ❌ Never use single-letter variable names (`i`, `j`, `k`, `n`, `c`, `e`, etc.)
- ✅ Use descriptive names that convey purpose (`itemIdx`, `charCount`, `ctx`, `err`)
- ❌ Never reuse the same name after a transformation
- ✅ Use prefixes to indicate encoding/format (`encodedPublicKey`, `base64Payload`, `hexHash`)

```typescript
// ❌ BAD - Single letter variables
for (let i = 0; i < items.length; i++) { ... }
const c = getContext();
const e = new Error();

// ✅ GOOD - Explicit names
for (let itemIdx = 0; itemIdx < items.length; itemIdx++) { ... }
const ctx = getContext();
const err = new Error();

// ❌ BAD - Same name after transformation
const publicKey = encodeBase64(something.publicKey); // WRONG!

// ✅ GOOD - Different names for different representations
const publicKeyBytes = input.publicKey;
const encodedPublicKey = encodeBase64(publicKeyBytes);

// ❌ BAD - No indication of encoding
const payload = toBase64(data);
const hash = sha256(input);

// ✅ GOOD - Encoding/format indicated in name
const base64Payload = toBase64(data);
const hexHash = sha256Hex(input);
```

### Semantic Types for Encoded Values

Encoded or formatted values MUST use semantic types that indicate their format.

**Rules:**
- Never use plain `string` for base64, hex, or other encoded values
- Use branded types or library-provided types (e.g., `Base64URLString` from SimpleWebAuthn)
- Create custom branded types when library types are not available

```typescript
// ❌ BAD - Plain string loses semantic information
interface Credential {
  id: string;        // Is this base64? Hex? Raw?
  publicKey: string; // What format?
}

// ✅ GOOD - Use library-provided semantic types
import type { Base64URLString } from '@simplewebauthn/types';

interface Credential {
  id: Base64URLString;
  publicKey: Base64URLString;
}

// ✅ GOOD - Create branded types when needed
type HexString = string & { readonly __brand: 'HexString' };
type Base64String = string & { readonly __brand: 'Base64String' };

namespace HexString {
  export function of(value: string): HexString {
    if (!/^[0-9a-fA-F]*$/.test(value)) {
      throw new InvalidHexStringError(value);
    }
    return value as HexString;
  }
}

// ✅ Function signatures clearly indicate expected formats
function verifySignature(
  message: Uint8Array,
  signature: Base64URLString,
  publicKey: Base64URLString,
): boolean { ... }
```

**Rationale:**
- Prevents encoding mismatches at compile time
- Documents intent directly in the type system
- Reduces bugs from accidentally mixing encoded/decoded values

### Discriminated Unions for States

```typescript
// ✅ Model all states explicitly
type SwapState =
  | { status: 'pending' }
  | { status: 'confirmed'; txHash: string }
  | { status: 'failed'; error: string };

// TypeScript forces handling all cases
function handleSwap(swap: SwapState) {
  switch (swap.status) {
    case 'pending': return 'Waiting...';
    case 'confirmed': return `TX: ${swap.txHash}`;
    case 'failed': return `Error: ${swap.error}`;
  }
}
```

### Explicit Return Types

Return types MUST be explicitly specified.

```typescript
// ❌ BAD - Promise return type should be explicit
export function getCreateAccountUseCase(deps: CreateAccountDeps) {
  const service = new CreateAccountService(deps);
  return (input: CreateAccountInput) => service.execute(input);
}

// ✅ GOOD - Explicit Promise return type
export function getCreateAccountUseCase(deps: CreateAccountDeps) {
  const service = new CreateAccountService(deps);
  return (input: CreateAccountInput): Promise<CreateAccountOutput> => service.execute(input);
}

// ❌ BAD - Async method without explicit return type
async function execute(input: CreateAccountInput) {
  // ...
  return { account, txHash };
}

// ✅ GOOD - Async method with explicit return type
async function execute(input: CreateAccountInput): Promise<CreateAccountOutput> {
  // ...
  return { account, txHash };
}

// ✅ GOOD - Even with simple getter
function getStatus(): AccountStatus {
  return this.status;
}
```

**Rationale:**
- IDE inference is not documentation; explicit types serve as contracts
- Promises are inherently asynchronous and their resolution type should be clear
- Higher-order functions benefit from explicit types for both parameters and return values
- Explicit types catch refactoring errors at compile time

### Explicit Type Annotations for Collections                                                                                                                                                                                                                 
                                                                                                                                                                                                                                                              
When declaring typed collections (Map, Set, Array, etc.), the type annotation MUST be on the 
left side of the declaration, not in the constructor generics.                                                                                                   

```typescript      
// ❌ BAD - Type in constructor generic                                                                                                                                                                                                                       
const mapVar = new Map<string, Swap>();
const setVar = new Set<string>();
const arrVar = new Array<Item>();

// ✅ GOOD - Explicit type annotation on the left                                                                                                                                                                                                             
const mapVar: Map<string, Swap> = new Map();
const setVar: Set<string> = new Set();
const arrVar: Item[] = [];                                                                                                                                                                                                                          
```                                                                                                                                                                                                                                                           
                                                                                                                                                                                                                                                              
**Rationale:**                                                                                                                                                                                                                                                
- Consistency with explicit return types and field declarations                                                                                                                                                                                               
- Type is immediately visible without looking at the right-hand side                                                                                                                                                                                          
- Better readability when scanning class fields

---

### Field Access: Immutable vs Mutable

- Fields that **never change** after construction MUST be marked `readonly`
    - No getter method needed for readonly fields
- Fields that **can change** after construction MUST be `private`
    - Access and modifications MUST be done through explicit methods (e.g., `getStatus()`, `markAsDeployed()`)
- JS/TS getter/setter syntax is banned
- `_`-prefixed fields are banned since there are no JS/TS `get` or `set` accessors


```ts
export class Account {
  private status: AccountStatus;
  private deploymentTxHash?: string;

  constructor(
    readonly id: AccountId, 
    readonly username: string
  ) {
    this.status = 'pending';
  }

  getStatus(): AccountStatus {
    return this.status;
  }

  markAsDeployed(txHash: string): void {
    if (this.status !== 'pending') {
      throw new InvalidStateTransitionError(this.status, 'deployed');
    }
    this.status = 'deployed';
    this.deploymentTxHash = txHash;
  }
}
```

---

### Function & Constructor Formatting

- **If a function or constructor has more than two parameters**, each parameter MUST be written on its own line, with proper indentation.
- **If a single parameter is long or complex** (e.g., an object with multiple fields), it MUST also be written on its own line.
- This improves readability and reduces diff noise in version control.
- The closing `)` aligns with the opening keyword (`function` or `constructor`).

```ts
// ✅ GOOD
export class Account {
  private status: AccountStatus;

  constructor(
    readonly id: AccountId,
    readonly username: string,
  ) {
    this.status = 'pending';
  }
}

// ✅ GOOD
function sendEmail(
  to: Email,
  subject: string,
  body: string,
): void {
  // implementation
}

// ✅ GOOD
export class Plop {
  constructor(
    private readonly deps: { idGenerator: () => AccountId }
  ) {
  }
}
```

---

## When to Use Classes vs Functions

### Use Classes For: Entities with Identity and Lifecycle

Classes are required for all entities with identity and lifecycle, e.g., Account, Swap.
They encapsulate the entity's domain behavior, with private or public methods.
Entities may be mutable or immutable—use mutation only when it simplifies invariants.

```typescript
// ✅ Account has mutable state and domain behavior
export class Account {
  private constructor(
    readonly id: AccountId,
    readonly username: string,
    private status: AccountStatus,
    private deploymentTxHash?: string,
  ) {}

  static create(params: { id: AccountId; username: string }): Account {
    return new Account(params.id, params.username, 'pending');
  }

  getStatus(): AccountStatus {
    return this.status;
  }

  // Domain behavior that modifies state
  markAsDeployed(txHash: string): void {
    if (this.status !== 'pending') {
      throw new InvalidStateTransitionError(this.status, 'deployed');
    }
    this.status = 'deployed';
    this.deploymentTxHash = txHash;
  }
}
```

### Use Functions + Types For: Everything Else

```typescript
// ✅ Value Object as branded type + factory
type Email = string & { readonly __brand: 'Email' };

namespace Email {
  export function isValid(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  export function of(value: string): Email {
    if (!isValid(value)) {
      throw new InvalidEmailError(value);
    }
    return value as Email;
  }
}

// ✅ Use case as function returning function (with explicit return type)
export function getCreateAccountUseCase(deps: CreateAccountDeps): CreateAccountUseCase {
  return async (input: CreateAccountInput): Promise<Account> => {
    const account = Account.create({ ... });
    await deps.accountRepository.save(account);
    return account;
  };
}

// ✅ Simple transformation as pure function
function calculateFee(amountSats: bigint): bigint {
  return amountSats * 5n / 1000n; // 0.5%
}
```

---

## Validation Strategy

### At Boundaries: Use Schema Validation (Zod)

```typescript
import { z } from 'zod';

// API input schema
const AccountSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
});

// In route handler
app.post('/accounts', async (c) => {
  const input = AccountSchema.parse(await c.req.json());
  // input is now typed AND validated
  // ...
  return c.json(result);
});
```

### Use Parameter Objects

- Prefer passing parameters as a single object (`params`) instead of multiple positional arguments
- Advantages:
    - Named arguments improve readability
    - Adding new parameters is non-breaking
    - Reduces risk of swapping arguments of the same type
- Always mark fields as `readonly` if they should not change
 
---

## Simplified Hexagonal Architecture

### Structure

```
packages/domain/
├── src/
│   ├── <bounded-context>/
│   │   ├── <entity>.ts           # Entity class
│   │   ├── <use-case>.usecase.ts # Use case function
│   │   └── types.ts              # Types, branded types, errors
│   └── ports/
│       └── <port>.ts             # Interfaces
└── test/
    └── <bounded-context>/
        └── <use-case>.test.ts

apps/api/
├── src/
│   ├── adapters/                 # Port implementations
│   ├── routes/                   # HTTP handlers + validation
│   └── main.ts
```

### Dependency Rules

```
┌─────────────────────────────────────────────────┐
│  Domain (packages/domain)                       │
│  - Pure TypeScript                              │
│  - Defines ports (interfaces)                   │
│  - No framework or infrastructure dependencies  │
│  - Runtime dependencies allowed **only if**:    │
│    - deterministic                              │
│    - side-effect free                           │
│    - not tied to IO, environment, or platform   │
└─────────────────────────────────────────────────┘
                    ▲
                    │ depends on
                    │
┌─────────────────────────────────────────────────┐
│  Infrastructure (apps/api)                      │
│  - Implements ports                             │
│  - Framework code (Hono, DB drivers)            │
│  - Validation at boundaries (Zod)               │
└─────────────────────────────────────────────────┘
```

---

## Ports (Interfaces)

```typescript
// Domain defines WHAT it needs, not HOW

export interface AccountRepository {
  save(account: Account): Promise<void>;
  findById(id: AccountId): Promise<Account | undefined>;
}

export interface StarknetGateway {
  calculateAddress(params: CalculateAddressParams): StarknetAddress;
  deployAccount(params: DeployParams): Promise<DeployResult>;
}
```

**Naming:**
- `Repository` for persistence
- `Gateway` for external services
- `Port` suffix optional (context makes it clear)

---
### Use Cases

All application use cases MUST be implemented using the following pattern:

1. **Internal class** encapsulates all logic, orchestration, and private helpers.
2. **execute** method contains the main use case workflow.
3. **Dependencies** are fixed via constructor injection.
4. **Curried facade function** is exported for ergonomic invocation; it simply instantiates the class and calls `execute`.
5. No internal logic should live in the facade function; all orchestration, helper methods, and domain interaction MUST remain inside the class.
6. Currying is only used for the facade to fix dependencies; it is not a substitute for internal decomposition.

### Use Case File Organization

**One file = one use case** (preferred), or exceptionally few closely related use cases.

**Rules:**
- All dependencies must be declared in the shared `Deps` interface
  - For multi-use case: define a **single shared `Deps` interface** containing ALL dependencies used by ALL use cases in the file
- Use `Pick<Deps, ...>` when including fewer fields than excluding
- Use `Omit<Deps, ...>` when excluding fewer fields than including
- Use the full `Deps` type when all dependencies are needed
- Never use `& { ... }` to extend — add dependencies to the shared interface instead
- Never use `Omit` to remove a field and re-add it with the same type

### Use Case Type Declaration

**Always explicitly declare the use case function type.**

```typescript
// ✅ GOOD - Explicit type declaration
export type CompleteRegistrationUseCase = (input: CompleteRegistrationInput) => Promise<CompleteRegistrationOutput>;

export function getCompleteRegistrationUseCase(
  deps: RegistrationUseCasesDeps,
): CompleteRegistrationUseCase { ... }

// ❌ BAD - Inline return type without explicit type alias
export function getCompleteRegistrationUseCase(
  deps: RegistrationUseCasesDeps,
): (input: CompleteRegistrationInput) => Promise<CompleteRegistrationOutput> { ... }
```

**Rationale:**
- Enables reuse of the type for consumers who need to reference it
- Documents the use case contract explicitly
- Improves readability of the factory function signature

### Use Case Naming Convention

**Naming pattern:** `get<Name>UseCase` for the factory function, `<Name>UseCase` for the type.

**Use different verbs for commands vs queries to avoid "getGet" pattern:**

| Type | Verbs | Example |
|------|-------|---------|
| **Commands** (mutations) | `Create`, `Update`, `Delete`, `Claim` | `getCreateAccountUseCase` |
| **Queries** (read-only) | `Fetch`, `Find`, `Load` | `getFetchSwapStatusUseCase` |

```typescript
// ✅ GOOD - Commands use Create, Update, Delete, Claim
export type CreateAccountUseCase = (input: CreateAccountInput) => Promise<CreateAccountOutput>;
export function getCreateAccountUseCase(deps: CreateAccountDeps): CreateAccountUseCase { ... }

export type ClaimSwapUseCase = (input: ClaimSwapInput) => Promise<ClaimSwapOutput>;
export function getClaimSwapUseCase(deps: ClaimSwapDeps): ClaimSwapUseCase { ... }

// ✅ GOOD - Queries use Fetch, Find, Load (avoids "getGet")
export type FetchSwapStatusUseCase = (input: FetchSwapStatusInput) => Promise<FetchSwapStatusOutput>;
export function getFetchSwapStatusUseCase(deps: FetchSwapStatusDeps): FetchSwapStatusUseCase { ... }

export type FetchSwapLimitsUseCase = (input: FetchSwapLimitsInput) => Promise<FetchSwapLimitsOutput>;
export function getFetchSwapLimitsUseCase(deps: FetchSwapLimitsDeps): FetchSwapLimitsUseCase { ... }

// ❌ BAD - "getGet" is ugly
export function getGetSwapStatusUseCase(deps: ...): GetSwapStatusUseCase { ... }

// ❌ BAD - Missing "get" prefix
export function createAccountUseCase(deps: ...): CreateAccountUseCase { ... }
```

**Rules:**
- Factory function: `get<Name>UseCase` (always starts with `get`)
- Type alias: `<Name>UseCase`
- Commands: use `Create`, `Update`, `Delete`, `Claim`, etc.
- Queries: use `Fetch` (data retrieval), `Find` (lookup/search), `Load` (into memory)

This ensures:
- Full encapsulation of orchestration logic
- Clear separation of dependencies and execution
- Readability and maintainability
- Testability by mocking dependencies or testing the class directly

---

### Canonical Example

```ts
export interface CreateAccountInput {
  username: string;
  credentialId: string;
  publicKey: { x: string; y: string };
}

export interface CreateAccountOutput {
  account: Account;
  txHash: string;
}

export interface CreateAccountDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
  idGenerator: () => AccountId;
}

export type CreateAccountUseCase = (input: CreateAccountInput) => Promise<CreateAccountOutput>;

export function getCreateAccountUseCase(
  deps: Pick<CreateAccountDeps, 'accountRepository' | 'starknetGateway'>,
): CreateAccountUseCase {
  return async (input: CreateAccountInput): Promise<CreateAccountOutput> => {
    // ...
    return { account, txHash };
  };
}
```

## Error Handling

### Custom Error Classes for Domain Errors

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

export class InvalidStateTransitionError extends DomainError {
  constructor(readonly from: string, readonly to: string) {
    super(`Invalid state transition from '${from}' to '${to}'`);
  }
}
```

### Result Type for Expected Failures (Optional)

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// When you want to force callers to handle errors explicitly
function parseEmail(value: string): Result<Email, InvalidEmailError> {
  if (!isValidEmail(value)) {
    return { ok: false, error: new InvalidEmailError(value) };
  }
  return { ok: true, value: value as Email };
}
```

---

## Testing

### Structure
- Tests in `test/` (not `src/`)
- Mirror source structure
- Use Vitest

### Mock Ports, Not Domain

```typescript
describe('getCreateAccountUseCase', () => {
  const mockDeps: CreateAccountDeps = {
    accountRepository: {
      save: vi.fn(),
      findById: vi.fn(),
    },
    starknetGateway: {
      calculateAddress: vi.fn(() => StarknetAddress('0x123')),
      deployAccount: vi.fn(async () => ({ txHash: '0xabc' })),
    },
    idGenerator: () => AccountId('account-1'),
  };

  it('creates and deploys account', async () => {
    const useCase = getCreateAccountUseCase(mockDeps);
    const result = await useCase({ username: 'alice', ... });

    expect(result.account.status).toBe('deployed');
    expect(mockDeps.accountRepository.save).toHaveBeenCalledWith(result.account);
  });
});
```

---

## Forbidden Patterns

- ❌ `any` type (use `unknown` + type guards)
- ❌ `null` (use `undefined`)
- ❌ Runtime null checks that TypeScript already guarantees
- ❌ Default exports
- ❌ `var` keyword
- ❌ Classes for simple data (use types/interfaces)
- ❌ Business logic in adapters/routes
- ❌ Framework imports in domain
- ❌ `console.log` (use proper logger)
- ❌ Barrel files with circular dependencies
