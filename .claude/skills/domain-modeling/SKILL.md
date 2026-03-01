---
name: domain-modeling
description: Guide for BIM domain modeling. This skill should be used when creating entities, branded types, value objects, domain services, error classes, state machines, or working with the domain layer in packages/domain.
---

# Domain Modeling

Hexagonal architecture (ports & adapters). Domain is pure TypeScript with no infrastructure dependencies. It defines interfaces (ports) that infrastructure implements (adapters).

## Bounded Contexts

All under `packages/domain/src/<context>/`. Each has: entity class(es), service(s), `index.ts` barrel. Types in `types.ts` when small; extract per type (`account-id.ts`, etc.) when it grows.

| Context | Key Entities | Description |
|---------|-------------|-------------|
| `account` | Account, AccountId, StarknetAddress | Username + WebAuthn + Starknet wallet |
| `auth` | Session, Challenge, CredentialId | WebAuthn registration/login, sessions, challenges |
| `payment` | Payment, Receive | Parse, pay, receive, fees, ERC-20 calls |
| `swap` | Swap, SwapId, LightningInvoice, BitcoinAddress | Cross-chain atomic: Lightning/Bitcoin <-> Starknet |
| `user` | UserSettings, Transaction | Settings, transaction history |
| `shared` | Amount, DomainError | Errors, Amount (millisatoshi base unit), StarknetConfig |
| `ports` | — | All interfaces (repositories + gateways) |

## Layer Rules

| Layer | Contains | Must NOT Contain |
|-------|----------|------------------|
| **Entity** | State transitions, invariants | I/O, external calls |
| **Service** | Orchestration, workflow | HTTP concerns, DB queries |
| **Adapter** | Technical implementation | Business rules |
| **Route** | Zod validation, HTTP mapping | Business logic |

**Domain is pure TypeScript.** Forbidden imports in `packages/domain/`: Hono, Drizzle, Zod, `node:fs`, `pg`, `fetch`. Exception: `pino` (logger) is allowed.

## Entity Pattern

```typescript
export class Account {
  constructor(
    readonly id: AccountId,            // Immutable: readonly
    readonly username: string,
    private status: AccountStatus,     // Mutable: private + getXxx()
  ) {}

  static create(params: CreateAccountParams): Account {
    return new Account(params.id, params.username, 'pending');
  }

  // No fromData/toData — persistence mapping lives in repository adapters.
  // Constructor is public to allow reconstitution from persistence layer.

  getStatus(): AccountStatus { return this.status; }

  markAsDeploying(address: StarknetAddress, txHash: string): void {
    if (this.status !== 'pending') throw new InvalidStateTransitionError(this.status, 'deploying');
    this.status = 'deploying';
  }
}
```

## Branded Types

```typescript
export type SwapId = string & { readonly __brand: 'SwapId' };
export namespace SwapId {
  export function of(value: string): SwapId {
    if (!value) throw new ValidationError('swapId', 'cannot be empty');
    return value as SwapId;  // Cast ONLY inside namespace
  }
  export function generate(): SwapId { return crypto.randomUUID() as SwapId; }
}
```

## State Machines

### Account: `pending -> deploying -> deployed | failed`

### Swap: `pending -> paid -> confirming -> completed | expired | failed`

Swap `mark*` methods are pure state setters (Atomiq is source of truth).

## Domain Errors

All extend abstract `DomainError`. Context-specific errors in `<context>/types.ts`, shared in `shared/errors.ts`.

```typescript
export class SwapNotFoundError extends DomainError {
  constructor(readonly swapId: SwapId | string) {
    super(`Swap not found: ${swapId}`);
  }
}
```

## Domain Services

```typescript
export class AccountService {
  constructor(private readonly deps: {
    accountRepository: AccountRepository;
    starknetGateway: StarknetGateway;
    paymasterGateway: PaymasterGateway;
    logger: Logger;
  }) {}
}
```

Dependencies via constructor object. Services call ports only, throw domain errors only.

## Port Interfaces

| Suffix | Purpose |
|--------|---------|
| `Repository` | Persistence (CRUD) |
| `Gateway` | External services |
| `Decoder` | Parsing external formats |

Repositories return `undefined` (not `null`) when not found, `save()` is upsert, take/return domain entities.

## New Entity Checklist

1. Branded type in `<context>/types.ts` (or in a specific file) with `of()` factory
2. Entity class: private constructor + `create()`
3. Domain errors extending `DomainError`
4. Port interface in `ports/`
5. Export from `<context>/index.ts`
6. Service class for orchestration
7. Unit tests in `packages/domain/test/<context>/`
