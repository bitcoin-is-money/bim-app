---
name: testing-conventions
description: Guide for testing conventions in the BIM project. This skill should be used when writing tests, creating test fixtures, mocking ports, or understanding the test infrastructure across all packages.
---

# Testing Conventions

## Test Tiers

| Tier | Location | Command | Dependencies |
|------|----------|---------|-------------|
| Unit (domain) | `packages/domain/test/` | `npm test -w @bim/domain` | None |
| Unit (lib) | `packages/lib/test/` | `npm test -w @bim/lib` | None |
| Unit (api) | `apps/api/test/unit/` | `npm test -w @bim/api` | Mocked ports |
| Unit (front) | `apps/front/src/**/*.test.ts` | `npm test -w @bim/front` | TestBed |
| Integration | `apps/api/test/integration/` | `npm run test:integration` | Docker (PG + Devnet) |
| Integration (single file) | `apps/api/test/integration/` | `npx vitest run --config apps/api/vitest.config.integration.ts <file>` | Docker (PG + Devnet) |
| Testnet | `apps/api/test/testnet/` | `npm run test:testnet -w @bim/api` | Sepolia + `AVNU_API_KEY` |

## File Placement

Mirror source structure:

```
src/account/account.ts                       -> test/account/account.test.ts
src/adapters/gateways/bolt11-*.ts            -> test/unit/adapters/gateways/bolt11-*.test.ts
apps/front/src/app/pages/home/home.page.ts   -> home.page.test.ts (co-located)
```

Integration tests: `apps/api/test/integration/<domain>/<file>.test.ts`

## Domain Unit Test Pattern

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AccountService', () => {
  let service: AccountService;
  let mockAccountRepo: AccountRepository;

  beforeEach(() => {
    mockAccountRepo = createAccountRepoMock();
    service = new AccountService({ accountRepository: mockAccountRepo, ... });
  });

  it('creates new account', async () => {
    vi.mocked(mockAccountRepo.existsByUsername).mockResolvedValue(false);
    const result = await service.create({ ... });
    expect(result.getStatus()).toBe('pending');
    expect(mockAccountRepo.save).toHaveBeenCalled();
  });
});
```

Mock factories in `packages/domain/test/helper.ts`:

```typescript
export function createAccountRepoMock(): AccountRepository {
  return { save: vi.fn(), findById: vi.fn(), findByUsername: vi.fn(), existsByUsername: vi.fn(), delete: vi.fn() };
}

export function createAccount(status: AccountStatus = 'pending'): Account {
  const account = Account.create({ id: AccountId.of('550e8400-e29b-41d4-a716-446655440000'), ... });
  if (status === 'deployed') { account.markAsDeploying(starknetAddress, '0xtx'); account.markAsDeployed(); }
  return account;
}
```

## Integration Test Pattern

```typescript
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestApp, TestDatabase } from '../helpers';

describe('Feature Name', () => {
  let appInstance: AppInstance;
  let pool: pg.Pool;
  let sessionCookie: string;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    appInstance = await TestApp.createTestApp();
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    // Insert fixtures, get sessionCookie
  });

  afterAll(async () => { await pool.end(); });

  it('returns expected response', async () => {
    const response = await TestApp.request(appInstance.app ?? appInstance)
      .post('/api/endpoint', { body: 'data' }, { headers: { Cookie: sessionCookie } });
    expect(response.status).toBe(200);
  });
});
```

## When to Write Which Test

| Change                   | Test Type                                   |
|--------------------------|---------------------------------------------|
| New entity/branded type  | Unit in `packages/domain/test/`             |
| New service method       | Unit with mocked ports                      |
| New API endpoint         | Integration in `apps/api/test/integration/` |
| New adapter              | no test                                     |
| Angular component        | no test                                     |
| Angular model with logic | unit test (co-located)                      |
| Bug fix                  | Regression test reproducing the bug         |

## Running Integration Tests

Integration tests are slow (~3 minutes for the full suite) because they spin up Docker containers (PostgreSQL + Starknet devnet).

**When iterating on a specific test file**, run only that file:

```bash
cd apps/api && npx vitest run --config vitest.config.integration.ts test/integration/payment/<file>.test.ts
```

**Run the full suite only as a final validation** before committing:

```bash
npm run test:integration
```
