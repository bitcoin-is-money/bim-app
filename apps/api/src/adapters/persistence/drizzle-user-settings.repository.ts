import * as schema from '@bim/db';
import {AccountId} from '@bim/domain/account';
import type {UserSettingsRepository} from "@bim/domain/ports";
import {FiatCurrency} from "@bim/domain/currency";
import {Language, UserSettings, UserSettingsId} from "@bim/domain/user";

import {eq} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';

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
        preferredCurrencies: data.preferredCurrencies.join(','),
        defaultCurrency: data.defaultCurrency,
        language: data.language,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.userSettings.id,
        set: {
          preferredCurrencies: data.preferredCurrencies.join(','),
          defaultCurrency: data.defaultCurrency,
          language: data.language,
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
    const preferredCurrencies = record.preferredCurrencies
      .split(',')
      .filter(c => c.length > 0)
      .map(c => FiatCurrency.of(c));

    return UserSettings.fromData({
      id: UserSettingsId.of(record.id),
      accountId: AccountId.of(record.accountId),
      preferredCurrencies,
      defaultCurrency: FiatCurrency.of(record.defaultCurrency),
      language: Language.of(record.language),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
