import * as schema from "../../../../src/db/schema";

/**
 * Creates a test user settings record
 */
export function createUserSettingsData(
  accountId: string,
  overrides?: Partial<schema.NewUserSettingsRecord>,
): schema.NewUserSettingsRecord {
  return {
    id: crypto.randomUUID(),
    accountId,
    fiatCurrency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a test transaction record
 */
export function createTransactionData(
  accountId: string,
  overrides?: Partial<schema.NewTransactionRecord>,
): schema.NewTransactionRecord {
  return {
    id: crypto.randomUUID(),
    accountId,
    transactionHash: '0x' + crypto.randomUUID().replace(/-/g, ''),
    blockNumber: '12345',
    transactionType: 'receipt',
    amount: '1000000000000000000',
    tokenAddress: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    fromAddress: '0x' + '2'.repeat(64),
    toAddress: '0x' + '1'.repeat(64),
    timestamp: new Date(),
    indexedAt: new Date(),
    ...overrides,
  };
}
