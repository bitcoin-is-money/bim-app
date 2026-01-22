import {
  AccountId,
  type AddressType,
  StarknetAddress,
  WatchedAddress,
  WatchedAddressId,
  type WatchedAddressRepository,
} from '@bim/domain';
import {and, eq} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from '../../../database/schema.js';

/**
 * Drizzle-based implementation of WatchedAddressRepository.
 */
export class DrizzleWatchedAddressRepository implements WatchedAddressRepository {

  constructor(
    private readonly db: NodePgDatabase<typeof schema>
  ) {}

  async save(address: WatchedAddress): Promise<void> {
    const data = address.toData();

    await this.db
      .insert(schema.watchedAddresses)
      .values({
        id: data.id,
        accountId: data.accountId,
        starknetAddress: data.starknetAddress,
        addressType: data.addressType,
        isActive: data.isActive,
        registeredAt: data.registeredAt,
        lastScannedBlock: data.lastScannedBlock?.toString(),
      })
      .onConflictDoUpdate({
        target: schema.watchedAddresses.id,
        set: {
          isActive: data.isActive,
          lastScannedBlock: data.lastScannedBlock?.toString(),
        },
      });
  }

  async findById(id: WatchedAddressId): Promise<WatchedAddress | undefined> {
    const record = await this.db.query.watchedAddresses.findFirst({
      where: eq(schema.watchedAddresses.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toWatchedAddress(record);
  }

  async findByAccountId(accountId: AccountId): Promise<WatchedAddress[]> {
    const records = await this.db.query.watchedAddresses.findMany({
      where: eq(schema.watchedAddresses.accountId, accountId),
    });

    return records.map((record) => this.toWatchedAddress(record));
  }

  async findByStarknetAddress(starknetAddress: StarknetAddress): Promise<WatchedAddress | undefined> {
    const record = await this.db.query.watchedAddresses.findFirst({
      where: eq(schema.watchedAddresses.starknetAddress, starknetAddress),
    });

    if (!record) {
      return undefined;
    }

    return this.toWatchedAddress(record);
  }

  async findAllActive(): Promise<WatchedAddress[]> {
    const records = await this.db.query.watchedAddresses.findMany({
      where: eq(schema.watchedAddresses.isActive, true),
    });

    return records.map((record) => this.toWatchedAddress(record));
  }

  private toWatchedAddress(record: schema.WatchedAddressRecord): WatchedAddress {
    return WatchedAddress.fromData({
      id: WatchedAddressId.of(record.id),
      accountId: AccountId.of(record.accountId),
      starknetAddress: StarknetAddress.of(record.starknetAddress),
      addressType: record.addressType as AddressType,
      isActive: record.isActive,
      registeredAt: record.registeredAt,
      lastScannedBlock: record.lastScannedBlock ? BigInt(record.lastScannedBlock) : undefined,
    });
  }
}
