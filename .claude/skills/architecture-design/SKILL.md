---
name: architecture-design
description: Guide for hexagonal architecture patterns. This skill should be used when designing domain layers, creating use cases, defining ports and adapters, or structuring code following clean architecture principles.
---

# Architecture Design

Hexagonal architecture patterns, use cases, ports and adapters for this project.

---

## Hexagonal Architecture Overview

### Directory Structure

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
│   ├── middleware/               # HTTP middleware
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

**Key principle:** Domain defines WHAT it needs (ports), Infrastructure defines HOW (adapters).

---

## Ports (Interfaces)

Ports are interfaces defined in the domain layer.

```typescript
export interface AccountRepository {
  save(account: Account): Promise<void>;
  findById(id: AccountId): Promise<Account | undefined>;
}

export interface StarknetGateway {
  calculateAddress(params: CalculateAddressParams): StarknetAddress;
  deployAccount(params: DeployParams): Promise<DeployResult>;
}
```

**Naming conventions:**
- `Repository` → for persistence (CRUD operations)
- `Gateway` → for external services (APIs, blockchain, etc.)
- `Port` suffix optional (context makes it clear)

---

## Use Cases

### Pattern

All use cases MUST follow this pattern:

1. **Curried factory function** exports the use case
2. **Dependencies** injected via first call
3. **Input** passed via second call
4. **Use case type** explicitly declared

### Use Case Type Declaration

```typescript
// ✅ GOOD - Explicit type declaration
export type CreateAccountUseCase = (input: CreateAccountInput) => Promise<CreateAccountOutput>;

export function getCreateAccountUseCase(
  deps: CreateAccountDeps,
): CreateAccountUseCase {
  return async (input: CreateAccountInput): Promise<CreateAccountOutput> => {
    // implementation
  };
}
```

### Naming Convention

**Pattern:** `get<Name>UseCase` for factory, `<Name>UseCase` for type.

| Type | Verbs | Example |
|------|-------|---------|
| **Commands** (mutations) | `Create`, `Update`, `Delete`, `Claim` | `getCreateAccountUseCase` |
| **Queries** (read-only) | `Fetch`, `Find`, `Load` | `getFetchSwapStatusUseCase` |

```typescript
// ✅ GOOD - Commands
export function getCreateAccountUseCase(deps): CreateAccountUseCase { ... }
export function getClaimSwapUseCase(deps): ClaimSwapUseCase { ... }

// ✅ GOOD - Queries (avoids "getGet")
export function getFetchSwapStatusUseCase(deps): FetchSwapStatusUseCase { ... }
export function getFindAccountUseCase(deps): FindAccountUseCase { ... }

// ❌ BAD
export function getGetSwapStatusUseCase(deps) { ... }  // "getGet" is ugly
export function createAccountUseCase(deps) { ... }     // Missing "get" prefix
```

### File Organization

**One file = one use case** (preferred).

**Deps interface rules:**
- Define a single shared `Deps` interface per file
- Use `Pick<Deps, ...>` when including fewer fields than excluding
- Use `Omit<Deps, ...>` when excluding fewer fields than including
- Never use `& { ... }` to extend

### Canonical Example

```typescript
// create-account.usecase.ts

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
    const id = deps.idGenerator();
    const account = Account.create({ id, username: input.username });

    const address = deps.starknetGateway.calculateAddress({
      publicKey: input.publicKey,
    });
    account.setStarknetAddress(address);

    await deps.accountRepository.save(account);

    return { account, txHash: '0x...' };
  };
}
```

---

## Adapters

Adapters implement ports and live in `apps/api/src/adapters/`.

### Repository Adapter Example

```typescript
// drizzle-account.repository.ts

export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly db: Database) {}

  async save(account: Account): Promise<void> {
    await this.db
      .insert(accountsTable)
      .values(this.toRow(account))
      .onConflictDoUpdate({
        target: accountsTable.id,
        set: this.toRow(account),
      });
  }

  async findById(id: AccountId): Promise<Account | undefined> {
    const row = await this.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, id))
      .limit(1)
      .then(rows => rows[0]);

    return row ? this.toDomain(row) : undefined;
  }

  private toRow(account: Account): AccountRow { ... }
  private toDomain(row: AccountRow): Account { ... }
}
```

### Gateway Adapter Example

```typescript
// starknet-rpc.gateway.ts

export class StarknetRpcGateway implements StarknetGateway {
  private readonly provider: RpcProvider;

  constructor(config: { rpcUrl: string; accountClassHash: string }) {
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  }

  calculateAddress(params: CalculateAddressParams): StarknetAddress {
    // implementation
  }

  async deployAccount(params: DeployParams): Promise<DeployResult> {
    // implementation
  }
}
```

---

## Testing

### Structure

- Tests in `test/` directory (not `src/`)
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
      calculateAddress: vi.fn(() => StarknetAddress.of('0x123')),
      deployAccount: vi.fn(async () => ({ txHash: '0xabc' })),
    },
    idGenerator: () => AccountId.of('account-1'),
  };

  it('creates and saves account', async () => {
    const useCase = getCreateAccountUseCase(mockDeps);

    const result = await useCase({
      username: 'testUser',
      credentialId: 'cred123',
      publicKey: { x: '0x1', y: '0x2' },
    });

    expect(result.account.username).toBe('testUser');
    expect(mockDeps.accountRepository.save).toHaveBeenCalledWith(result.account);
  });
});
```

### Testing Principles

1. **Mock ports** (repositories, gateways), not domain entities
2. **Test behavior**, not implementation details
3. **Use descriptive test names** that explain the scenario
4. **One assertion per test** when possible
5. **Use camelCase for test data** (e.g., `testUser`, not `testuser`)

---

## Business Logic Placement

| Layer | Contains | Does NOT Contain |
|-------|----------|------------------|
| **Domain Entity** | State transitions, invariants validation | I/O, external calls |
| **Use Case** | Orchestration, workflow logic | HTTP, DB queries |
| **Adapter** | Technical implementation | Business rules |
| **Route** | Input validation (Zod), HTTP mapping | Business logic |

**Rule:** Business logic in adapters/routes is **forbidden**.

---

## Design Principles

### Domain-Specific Naming

Avoid generic names like `utils`, `helpers`, `common`, `misc`:

```typescript
// ❌ BAD - Generic naming
import { formatDate } from '@/utils';
import { validate } from '@/helpers';

// ✅ GOOD - Domain-specific naming
import { formatOrderDate } from '@/order/formatters';
import { validatePaymentAmount } from '@/payment/validators';
```

### Avoid NIH Syndrome

**N**ot **I**nvented **H**ere syndrome = rewriting what already exists.

Before writing custom code, evaluate:
1. npm packages
2. SaaS solutions (Auth0, Stripe, etc.)
3. Third-party APIs

**Custom code is justified only for:**
- Domain-specific business logic
- Performance-critical sections
- Security-sensitive operations
- When existing solutions are inadequate

> Every line of custom code is a liability that needs maintenance, testing, and documentation.

### No Test-Only Methods in Production Code

**Rule:** Never generate methods in domain/application code that are only used by tests.

If a method is not called by the application, it should not exist in production code. Test-specific utilities belong in test helpers (`test/helpers/`).
