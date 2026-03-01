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
    const preferredCurrencies = settings.getPreferredCurrencies().join(',');

    await this.db
      .insert(schema.userSettings)
      .values({
        id: settings.id,
        accountId: settings.accountId,
        preferredCurrencies,
        defaultCurrency: settings.getDefaultCurrency(),
        language: settings.getLanguage(),
        createdAt: settings.createdAt,
        updatedAt: settings.getUpdatedAt(),
      })
      .onConflictDoUpdate({
        target: schema.userSettings.id,
        set: {
          preferredCurrencies,
          defaultCurrency: settings.getDefaultCurrency(),
          language: settings.getLanguage(),
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

    return new UserSettings(
      UserSettingsId.of(record.id),
      AccountId.of(record.accountId),
      record.createdAt,
      preferredCurrencies,
      FiatCurrency.of(record.defaultCurrency),
      Language.of(record.language),
      record.updatedAt,
    );
  }
}
