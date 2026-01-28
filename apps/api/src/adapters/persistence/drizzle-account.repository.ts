import {Account, AccountId, type AccountStatus, CredentialId, StarknetAddress,} from '@bim/domain/account';
import {type AccountRepository} from '@bim/domain/ports';
import {eq} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from '../../../database/schema.js';

/**
 * Drizzle-based implementation of AccountRepository.
 */
export class DrizzleAccountRepository implements AccountRepository {

  constructor(
    private readonly db: NodePgDatabase<typeof schema>
  ) {}

  async save(account: Account): Promise<void> {
    const data = account.toData();

    await this.db
      .insert(schema.accounts)
      .values({
        id: data.id,
        username: data.username,
        credentialId: data.credentialId,
        publicKey: data.publicKey,
        credentialPublicKey: data.credentialPublicKey,
        starknetAddress: data.starknetAddress,
        status: data.status,
        deploymentTxHash: data.deploymentTxHash,
        signCount: data.signCount,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.accounts.id,
        set: {
          username: data.username,
          credentialId: data.credentialId,
          publicKey: data.publicKey,
          credentialPublicKey: data.credentialPublicKey,
          starknetAddress: data.starknetAddress,
          status: data.status,
          deploymentTxHash: data.deploymentTxHash,
          signCount: data.signCount,
          updatedAt: new Date(),
        },
      });
  }

  async findById(id: AccountId): Promise<Account | undefined> {
    const record = await this.db.query.accounts.findFirst({
      where: eq(schema.accounts.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toAccount(record);
  }

  async findByUsername(username: string): Promise<Account | undefined> {
    const record = await this.db.query.accounts.findFirst({
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
    const record = await this.db.query.accounts.findFirst({
      where: eq(schema.accounts.credentialId, credentialId),
    });

    if (!record) {
      return undefined;
    }

    return this.toAccount(record);
  }

  async existsByUsername(username: string): Promise<boolean> {
    const record = await this.db.query.accounts.findFirst({
      where: eq(schema.accounts.username, username),
      columns: { id: true },
    });

    return record !== undefined;
  }

  async delete(id: AccountId): Promise<void> {
    await this.db.delete(schema.accounts).where(eq(schema.accounts.id, id));
  }

  private toAccount(record: schema.AccountRecord): Account {
    return Account.fromData({
      id: AccountId.of(record.id),
      username: record.username,
      credentialId: CredentialId.of(record.credentialId),
      publicKey: record.publicKey,
      credentialPublicKey: record.credentialPublicKey ?? undefined,
      starknetAddress: record.starknetAddress
        ? StarknetAddress.of(record.starknetAddress)
        : undefined,
      status: record.status as AccountStatus,
      deploymentTxHash: record.deploymentTxHash ?? undefined,
      signCount: record.signCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
