import {AccountId} from '@bim/domain/account';
import type {UserSettingsRepository} from "@bim/domain/ports";
import {FiatCurrency, UserSettings, UserSettingsId} from "@bim/domain/user";

import {eq} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema.js';

/**
 * Drizzle-based implementation of UserSettingsRepository.
 */
export class DrizzleUserSettingsRepository implements UserSettingsRepository {

  constructor(
    private readonly db: NodePgDatabase<typeof schema>
  ) {}

  async save(settings: UserSettings): Promise<void> {
    const data = settings.toData();

    await this.db
      .insert(schema.userSettings)
      .values({
        id: data.id,
        accountId: data.accountId,
        fiatCurrency: data.fiatCurrency,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.userSettings.id,
        set: {
          fiatCurrency: data.fiatCurrency,
          updatedAt: new Date(),
        },
      });
  }

  async findByAccountId(accountId: AccountId): Promise<UserSettings | undefined> {
    const record = await this.db.query.userSettings.findFirst({
      where: eq(schema.userSettings.accountId, accountId),
    });

    if (!record) {
      return undefined;
    }

    return this.toUserSettings(record);
  }

  private toUserSettings(record: schema.UserSettingsRecord): UserSettings {
    return UserSettings.fromData({
      id: UserSettingsId.of(record.id),
      accountId: AccountId.of(record.accountId),
      fiatCurrency: FiatCurrency.of(record.fiatCurrency),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
