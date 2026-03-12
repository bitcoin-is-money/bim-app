import * as schema from '@bim/db';
import type {Database} from '@bim/db/database';
import {Account, AccountId, type AccountStatus, CredentialId, StarknetAddress,} from '@bim/domain/account';
import type {AccountRepository} from '@bim/domain/ports';
import {and, eq, or} from 'drizzle-orm';
import {AbstractDrizzleRepository} from './abstract-drizzle.repository';

/**
 * Drizzle-based implementation of AccountRepository.
 */
export class DrizzleAccountRepository extends AbstractDrizzleRepository implements AccountRepository {

  constructor(db: Database) {
    super(db);
  }

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
