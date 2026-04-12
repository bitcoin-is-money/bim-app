import * as schema from '@bim/db';
import {Account, AccountId, type AccountStatus, CredentialId, StarknetAddress,} from '@bim/domain/account';
import type {AccountRepository, CountOptions} from '@bim/domain/ports';
import {and, count, eq, gte, or, sql, type SQL} from 'drizzle-orm';
import {AbstractDrizzleRepository} from './abstract-drizzle.repository';

/**
 * Drizzle-based implementation of AccountRepository.
 */
export class DrizzleAccountRepository extends AbstractDrizzleRepository implements AccountRepository {

  async save(account: Account): Promise<void> {
    await this.resolveDb()
      .insert(schema.accounts)
      .values({
        id: account.id,
        username: account.username,
        credentialId: account.credentialId,
        publicKey: account.publicKey,
        credentialPublicKey: account.credentialPublicKey,
        starknetAddress: account.getStarknetAddress(),
        status: account.getStatus(),
        deploymentTxHash: account.getDeploymentTxHash(),
        signCount: account.getSignCount(),
        createdAt: account.createdAt,
        updatedAt: account.getUpdatedAt(),
      })
      .onConflictDoUpdate({
        target: schema.accounts.id,
        set: {
          username: account.username,
          credentialId: account.credentialId,
          publicKey: account.publicKey,
          credentialPublicKey: account.credentialPublicKey,
          starknetAddress: account.getStarknetAddress(),
          status: account.getStatus(),
          deploymentTxHash: account.getDeploymentTxHash(),
          signCount: account.getSignCount(),
          updatedAt: new Date(),
        },
      });
  }

  async findById(id: AccountId): Promise<Account | undefined> {
    const record = await this.resolveDb().query.accounts.findFirst({
      where: eq(schema.accounts.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toAccount(record);
  }

  async findByUsername(username: string): Promise<Account | undefined> {
    const record = await this.resolveDb().query.accounts.findFirst({
      where: eq(schema.accounts.username, username),
    });

    if (!record) {
      return undefined;
    }

    return this.toAccount(record);
  }

  async findByCredentialId(
    credentialId: CredentialId,
  ): Promise<Account | undefined> {
    const record = await this.resolveDb().query.accounts.findFirst({
      where: eq(schema.accounts.credentialId, credentialId),
    });

    if (!record) {
      return undefined;
    }

    return this.toAccount(record);
  }

  async findByStarknetAddress(address: StarknetAddress): Promise<Account | undefined> {
    const record = await this.resolveDb().query.accounts.findFirst({
      where: eq(schema.accounts.starknetAddress, address),
    });

    if (!record) {
      return undefined;
    }

    return this.toAccount(record);
  }

  async existsByUsername(username: string): Promise<boolean> {
    const record = await this.resolveDb().query.accounts.findFirst({
      where: eq(schema.accounts.username, username),
      columns: { id: true },
    });

    return record !== undefined;
  }

  async countAll(options?: CountOptions): Promise<number> {
    const result = await this.resolveDb()
      .select({count: count()})
      .from(schema.accounts)
      .where(usernameExclude(options));

    return result[0]?.count ?? 0;
  }

  async countCreatedSince(date: Date, options?: CountOptions): Promise<number> {
    const result = await this.resolveDb()
      .select({count: count()})
      .from(schema.accounts)
      .where(and(gte(schema.accounts.createdAt, date), usernameExclude(options)));

    return result[0]?.count ?? 0;
  }

  async markAsDeploying(
    accountId: AccountId,
    starknetAddress: StarknetAddress,
    txHash: string,
  ): Promise<boolean> {
    const result = await this.resolveDb()
      .update(schema.accounts)
      .set({
        status: 'deploying',
        starknetAddress: starknetAddress.toString(),
        deploymentTxHash: txHash,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.accounts.id, accountId),
          or(
            eq(schema.accounts.status, 'pending'),
            eq(schema.accounts.status, 'failed'),
          ),
        ),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(id: AccountId): Promise<void> {
    await this.resolveDb().delete(schema.accounts).where(eq(schema.accounts.id, id));
  }

  private toAccount(record: schema.AccountRecord): Account {
    return new Account(
      AccountId.of(record.id),
      record.username,
      CredentialId.of(record.credentialId),
      record.publicKey,
      record.credentialPublicKey ?? undefined,
      record.createdAt,
      record.status as AccountStatus,
      record.signCount,
      record.starknetAddress
        ? StarknetAddress.of(record.starknetAddress)
        : undefined,
      record.deploymentTxHash ?? undefined,
      record.updatedAt,
    );
  }
}

function usernameExclude(options?: CountOptions): SQL | undefined {
  if (!options?.excludeUsernamePrefix) return undefined;
  return sql`NOT starts_with(${schema.accounts.username}, ${options.excludeUsernamePrefix})`;
}
