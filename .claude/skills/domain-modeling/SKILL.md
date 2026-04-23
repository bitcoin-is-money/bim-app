---
name: domain-modeling
description: Guide for BIM domain modeling. This skill should be used when creating entities, branded types, value objects, domain services, use cases, error classes, state machines, or working with the domain layer in packages/domain.
---

# Domain Modeling

## Architecture Mix

BIM's domain combines three traditions:
- **Hexagonal** (Cockburn) — ports & adapters; primary ports (API) vs secondary ports (SPI).
- **Clean Architecture** (Uncle Bob) — entities (enterprise rules) vs use cases (application rules).
- **DDD practices** (Evans / Vernon) — rich domain model, ubiquitous language, domain services only when justified.

**Pragmatic compromise for project size.** Use cases live in `@bim/domain` rather than a separate `application` package. Layer separation is enforced *inside* the package through `use-cases/` (primary port interfaces) and `services/` (implementations + internal domain services). See `ARCHITECTURE.md` for the full rationale.

## Fundamental Rules

1. **Rich domain model.** Entities own their behavior (invariants, transitions, rules on own state). Anemic entities (getter/setter bags with all logic in services) are forbidden.
2. **Entity method first, domain service only when justified.** Create a `DomainService` only when the operation (a) spans multiple aggregates, (b) is stateless and owns no invariant, or (c) would force an entity to know things outside its concern.
3. **UseCase = primary port = API.** One interface per business operation. The interface is named as a verb-phrase (`DeployAccountUseCase`, `ValidateSessionUseCase`). Its single method uses the **domain verb** (`deploy`, `validate`), never a generic `execute` — unless "execute" IS the domain verb (e.g. `PaymentExecutor.execute()` for a signed payment).
4. **Services named as role-actors.** Implementing classes are nouns describing an agent: `AccountDeployer`, `SessionValidator`, `Registrar`, `PaymentBuilder`. Files match in kebab-case: `account-deployer.service.ts`. Never `DeployAccount` (verb-phrase class names).
5. **Grouping allowed when natural.** A single class may implement multiple UseCase interfaces when the operations share concepts, a flow, or a natural role (e.g. `Registrar` implements `BeginRegistrationUseCase.begin()` + `CompleteRegistrationUseCase.complete()`). Split them when their deps or lifecycles differ significantly (e.g. `SessionValidator` and `SessionInvalidator` stay separate — very different deps and contexts).
6. **Repository / Gateway / Decoder = secondary port = SPI.** Declared in `ports/`, implemented by adapters.
7. **Pure TypeScript in domain.** No Hono / Drizzle / Zod / `node:*`. Exception: `pino` as `type Logger` only.
8. **Dependencies via constructor.** No static calls, no DI magic.
9. **Domain errors, thrown.** Extend `DomainError`, never throw raw `Error`. Entities throw on invariant violations; services throw when preconditions aren't met.

## Structure per Bounded Context

```
packages/domain/src/<context>/
├── <entity>.ts                     Entity — state + behavior
├── types.ts                        Branded types, status literals
├── use-cases/                      Primary ports (API): interface + I/O types only
│   └── <operation>.use-case.ts
├── services/                       UseCase impls + internal domain services
│   └── <operation>.service.ts
└── index.ts                        Barrel re-export
```

`packages/domain/src/ports/` holds the secondary ports (SPI): `Repository`, `Gateway`, `Decoder` interfaces.

## Bounded Contexts

| Context | Key Entities | Description |
|---------|--------------|-------------|
| `account` | Account, AccountId, StarknetAddress | Username + WebAuthn + Starknet wallet |
| `auth` | Session, Challenge, CredentialId | WebAuthn registration/login, sessions, challenges |
| `payment` | Payment, Receive | Parse, pay, receive, fees, ERC-20 calls |
| `swap` | Swap, SwapId, LightningInvoice, BitcoinAddress | Cross-chain atomic: Lightning/Bitcoin <-> Starknet |
| `user` | UserSettings, Transaction | Settings, transaction history |
| `shared` | Amount, DomainError | Shared value objects, errors, StarknetConfig |
| `ports` | — | Secondary ports (repositories + gateways + decoders) |

## Layer Rules

| Role | Folder | Contains | Must NOT Contain |
|------|--------|----------|------------------|
| **Entity** | `<context>/` | Invariants, transitions, behavior on own state | I/O, port calls |
| **Primary port (UseCase)** | `<context>/use-cases/` | Interface + I/O types | Implementation, logic |
| **Service (UC impl or internal)** | `<context>/services/` | Orchestration (UC impl) or multi-aggregate / stateless logic | HTTP, direct DB, single-aggregate rules |
| **Secondary port (SPI)** | `ports/` | `Repository` / `Gateway` / `Decoder` interfaces | Implementation |
| **Adapter** | `apps/api/src/adapters/` or dedicated `packages/*` | Technical implementation | Business rules |
| **Route** | `apps/api/src/routes/` | Zod validation, auth, DTO mapping, HTTP errors | Business logic |

**Domain is pure TypeScript.** Forbidden imports in `packages/domain/`: Hono, Drizzle, Zod, `node:fs`, `pg`, `fetch`. Exception: `pino` (logger) is allowed.

## UseCase vs Entity Method vs Domain Service — Decision Tree

When adding a new operation, decide:

- **Triggered by an external actor** (route, CLI, scheduler)? → **UseCase**. Interface in `use-cases/<op>.use-case.ts`, implementation class in `services/<op>.service.ts`.
- **Operates on a single aggregate's state** (invariant, transition, rule about its own data)? → **Entity method**. No service.
- **Spans multiple aggregates, OR stateless with no invariant** (calculator, parser, factory)? → **Internal DomainService** in `<context>/services/`, with NO corresponding interface in `use-cases/`. Called by a UseCase or another service.

### Examples

| Operation | Where it lives |
|-----------|----------------|
| Deploy account (triggered by `POST /account/deploy`) | UseCase — interface `DeployAccountUseCase.deploy()` in `account/use-cases/`, class `AccountDeployer` in `account/services/` |
| Get balance + get deployment status | UseCases `GetBalanceUseCase.getBalance()` + `GetDeploymentStatusUseCase.getDeploymentStatus()`, **grouped** under `AccountReader` (one class implements both) |
| Begin + complete registration | UseCases `BeginRegistrationUseCase.begin()` + `CompleteRegistrationUseCase.complete()`, **grouped** under `Registrar` |
| Account status transition from `pending` to `deploying` | Entity method `Account.markAsDeploying()` |
| Fee calculation from amount + network + config | Internal DomainService `FeeCalculator` in `payment/services/`, no interface |
| Parsing an invoice / address / payment URI | Internal DomainService `PaymentParser` in `payment/services/`, no interface |
| Hypothetical `MoneyTransfer(from, to, amount)` (multi-aggregate) | Internal DomainService in `<context>/services/`, no interface |

## UseCase Pattern

The interface's method uses the **domain verb** (not `execute`):

```typescript
// packages/domain/src/account/use-cases/deploy-account.use-case.ts
import type {Account, AccountId} from '..';

export type DeployAccountInput = {accountId: AccountId};
export type DeployAccountOutput = {account: Account; txHash: string};

export interface DeployAccountUseCase {
  deploy(input: DeployAccountInput): Promise<DeployAccountOutput>;
}
```

The implementing class is named as an **actor-role noun**:

```typescript
// packages/domain/src/account/services/account-deployer.service.ts
export class AccountDeployer implements DeployAccountUseCase {
  constructor(private readonly deps: {
    accountRepository: AccountRepository;
    paymasterGateway: PaymasterGateway;
    starknetGateway: StarknetGateway;
    logger: Logger;
  }) {}

  async deploy({accountId}: DeployAccountInput): Promise<DeployAccountOutput> {
    const account = await this.deps.accountRepository.findById(accountId);
    if (!account) throw new AccountNotFoundError(accountId);
    // load → call entity methods → call ports → persist → return
  }
}
```

Routes depend on the interface, never on the concrete class.
**The `appCtx.useCases` map is keyed by actor name**, not by use case
name — this avoids the `getBalance.getBalance(...)` redundancy:

```typescript
const {accountDeployer} = appCtx.useCases;
await accountDeployer.deploy({accountId});
```

### Grouping multiple use cases under one class

When two UseCases belong to the same flow (e.g. `begin` + `complete` of a
two-phase registration), one class can implement both interfaces:

```typescript
// packages/domain/src/auth/services/registrar.service.ts
export class Registrar implements BeginRegistrationUseCase, CompleteRegistrationUseCase {
  async begin(input: BeginRegistrationInput): Promise<BeginRegistrationOutput> { ... }
  async complete(input: CompleteRegistrationInput): Promise<CompleteRegistrationOutput> { ... }
}
```

The `AppContext['useCases']` map exposes the actor under a single key,
typed as the **intersection** of the implemented interfaces:

```typescript
useCases: {
  registrar: BeginRegistrationUseCase & CompleteRegistrationUseCase;
  // ...
}
```

Routes destructure by actor name and call the domain-verb method:

```typescript
const {registrar} = appCtx.useCases;
await registrar.begin({username});
await registrar.complete({challengeId, accountId, username, credential});
```

Split when the deps or concerns diverge significantly (e.g. `SessionValidator`
vs `SessionInvalidator`: one has 4 deps including sessionConfig, the other has
just sessionRepository).

## Entity Pattern (Rich Domain Model)

```typescript
export class Account {
  private status: AccountStatus;

  constructor(
    readonly id: AccountId,
    readonly username: string,
    status: AccountStatus,
  ) {
    this.status = status;
  }

  static create(params: CreateAccountParams): Account {
    return new Account(params.id, params.username, 'pending');
  }

  getStatus(): AccountStatus { return this.status; }

  // Rule on own state: entity method, throws domain error on violation.
  markAsDeploying(address: StarknetAddress, txHash: string): void {
    if (this.status !== 'pending' && this.status !== 'failed') {
      throw new InvalidStateTransitionError(this.status, 'deploying');
    }
    this.status = 'deploying';
  }

  canDeploy(): boolean {
    return this.status === 'pending' || this.status === 'failed';
  }
}
```

### Anti-pattern — Anemic Domain Model (forbidden)

```typescript
// FORBIDDEN — entity as a data bag, rules leak into a service
class Account {
  setStatus(s: AccountStatus) { this.status = s; }  // no invariant
}
class AccountStatusService {
  changeStatus(account: Account, newStatus: AccountStatus) {
    if (/* rule about Account's state */) account.setStatus(newStatus);
    // rule about a single Account lives outside the Account entity
  }
}
```

If the rule concerns the entity's own state, the rule belongs on the entity.

## Branded Types

```typescript
export type SwapId = string & {readonly __brand: 'SwapId'};
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

### Swap: `pending -> (committed) -> paid -> claimable -> completed | expired | failed | refunded | lost`

Swap `mark*` methods are pure state setters (Atomiq is source of truth).

## Domain Errors

All extend abstract `DomainError`. Context-specific errors in `<context>/errors.ts`, shared in `shared/errors.ts`. `ErrorCode` lives in `packages/domain/src/shared/error-codes.ts`.

Each error must declare `errorCode` and optionally override `get args()` for i18n interpolation:

```typescript
export class SwapNotFoundError extends DomainError {
  readonly errorCode = ErrorCode.SWAP_NOT_FOUND;

  constructor(readonly swapId: SwapId | string) {
    super(`Swap not found: ${swapId}`);
  }

  override get args() { return {swapId: String(this.swapId)}; }
}
```

Use native `cause` chaining (`super(msg, {cause})`) when wrapping external errors, not a `readonly cause` field.

**Where errors are thrown:**
- **Entities** throw on invariant violations and invalid state transitions.
- **Services** (UseCase impls or internal) throw when a precondition isn't met (aggregate not found, port error wrapped, etc.).
- **Routes** catch `DomainError` and map to HTTP status via the central error mapper.

## Port Interfaces (Secondary / SPI)

| Suffix | Purpose |
|--------|---------|
| `Repository` | Persistence (CRUD) |
| `Gateway` | External services |
| `Decoder` | Parsing external formats |

Repositories return `undefined` (not `null`) when not found, `save()` is upsert, take/return domain entities.

## New Operation Checklist

For a new business operation (e.g. `PayLightningInvoice`):

1. Decide: UseCase, entity method, or internal domain service (see decision tree above).
2. If UseCase:
   - Create the interface + I/O types in `<context>/use-cases/<op>.use-case.ts`. Interface named as verb-phrase (`PayLightningInvoiceUseCase`), single method using the domain verb (`pay`, not `execute`).
   - Decide on the implementing class: either a new actor-role class (`LightningInvoicePayer`) OR group the operation onto an existing actor if natural (`PaymentExecutor` already handling similar ops).
   - Create / update the class in `<context>/services/<actor>.service.ts` with `implements <Op>UseCase`. Class name is a noun (actor), file matches in kebab-case.
   - Wire in `apps/api/src/app-context.ts` — the same instance may back multiple `useCases.*` keys when grouped.
   - Route handler depends on the interface type, not the class.
3. Rules / invariants of a single aggregate → entity methods (throw `DomainError` on violation).
4. Multi-aggregate or stateless logic → internal domain service in `<context>/services/` (no interface in `use-cases/`). Named as actor (`FeeCalculator`, `PaymentParser`, `ChallengeConsumer`).
5. Secondary ports go in `packages/domain/src/ports/`; adapters in `apps/api/src/adapters/`.
6. Unit tests in `packages/domain/test/<context>/services/<actor>.service.test.ts`. One test file per class; group sub-describe blocks by method when the class implements multiple use cases.
7. Export from `<context>/index.ts`.
