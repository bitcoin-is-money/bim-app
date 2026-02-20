import * as schema from '@bim/db';
import type {SwapRepository} from '@bim/domain/ports';
import {Swap, type SwapDirection, SwapId, type SwapState, type SwapStatus} from '@bim/domain/swap';
import {and, eq, lt, notInArray} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';

const TERMINAL_STATUSES: SwapStatus[] = ['completed', 'expired', 'failed'];

/**
 * Drizzle-based implementation of SwapRepository.
 * Persists swap data in PostgreSQL via the bim_swaps table.
 */
export class DrizzleSwapRepository implements SwapRepository {

  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async save(swap: Swap): Promise<void> {
    const data = swap.toData();
    const stateColumns = this.stateToColumns(data.state);

    await this.db
      .insert(schema.swaps)
      .values({
        id: data.id,
        direction: data.direction,
        amountSats: data.amountSats.toString(),
        destinationAddress: data.destinationAddress,
        sourceAddress: data.sourceAddress ?? null,
        invoice: data.invoice ?? null,
        depositAddress: data.depositAddress ?? null,
        description: data.description ?? null,
        accountId: data.accountId ?? null,
        expiresAt: data.expiresAt,
        createdAt: data.createdAt,
        ...stateColumns,
      })
      .onConflictDoUpdate({
        target: schema.swaps.id,
        set: stateColumns,
      });
  }

  async findById(id: SwapId): Promise<Swap | undefined> {
    let record;
    try {
      record = await this.db.query.swaps.findFirst({
        where: eq(schema.swaps.id, id),
      });
    } catch {
      // Invalid UUID format — treat as not found
      return undefined;
    }

    if (!record) {
      return undefined;
    }

    return this.toSwap(record);
  }

  async findByStatus(status: SwapStatus): Promise<Swap[]> {
    const records = await this.db.query.swaps.findMany({
      where: eq(schema.swaps.status, status),
    });

    return records.map((record) => this.toSwap(record));
  }

  async findByDestinationAddress(address: string): Promise<Swap[]> {
    const records = await this.db.query.swaps.findMany({
      where: eq(schema.swaps.destinationAddress, address.toLowerCase()),
    });

    return records.map((record) => this.toSwap(record));
  }

  async findActive(): Promise<Swap[]> {
    const records = await this.db.query.swaps.findMany({
      where: notInArray(schema.swaps.status, TERMINAL_STATUSES),
    });

    return records.map((record) => this.toSwap(record));
  }

  async findByDirection(direction: SwapDirection): Promise<Swap[]> {
    const records = await this.db.query.swaps.findMany({
      where: eq(schema.swaps.direction, direction),
    });

    return records.map((record) => this.toSwap(record));
  }

  async delete(id: SwapId): Promise<void> {
    await this.db.delete(schema.swaps).where(eq(schema.swaps.id, id));
  }

  async deleteExpiredBefore(date: Date): Promise<number> {
    const result = await this.db
      .delete(schema.swaps)
      .where(
        and(
          eq(schema.swaps.status, 'expired'),
          lt(schema.swaps.createdAt, date),
        ),
      );

    return result.rowCount ?? 0;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private stateToColumns(state: SwapState) {
    const base = {
      status: state.status,
      txHash: null as string | null,
      errorMessage: null as string | null,
      paidAt: null as Date | null,
      confirmedAt: null as Date | null,
      completedAt: null as Date | null,
      expiredAt: null as Date | null,
      failedAt: null as Date | null,
    };

    switch (state.status) {
      case 'pending':
        return base;
      case 'paid':
        return {...base, paidAt: state.paidAt};
      case 'confirming':
        return {...base, txHash: state.txHash, confirmedAt: state.confirmedAt};
      case 'completed':
        return {...base, txHash: state.txHash, completedAt: state.completedAt};
      case 'expired':
        return {...base, expiredAt: state.expiredAt};
      case 'failed':
        return {...base, errorMessage: state.error, failedAt: state.failedAt};
    }
  }

  private columnsToState(record: schema.SwapRecord): SwapState {
    switch (record.status) {
      case 'pending':
        return {status: 'pending'};
      case 'paid':
        return {status: 'paid', paidAt: record.paidAt!};
      case 'confirming':
        return {status: 'confirming', txHash: record.txHash!, confirmedAt: record.confirmedAt!};
      case 'completed':
        return {status: 'completed', txHash: record.txHash!, completedAt: record.completedAt!};
      case 'expired':
        return {status: 'expired', expiredAt: record.expiredAt!};
      case 'failed':
        return {status: 'failed', error: record.errorMessage!, failedAt: record.failedAt!};
      default:
        throw new Error(`Unknown swap status: ${record.status}`);
    }
  }

  private toSwap(record: schema.SwapRecord): Swap {
    return Swap.fromData({
      id: SwapId.of(record.id),
      direction: record.direction as SwapDirection,
      amountSats: BigInt(record.amountSats),
      destinationAddress: record.destinationAddress,
      sourceAddress: record.sourceAddress ?? undefined,
      state: this.columnsToState(record),
      invoice: record.invoice ?? undefined,
      depositAddress: record.depositAddress ?? undefined,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      description: record.description ?? undefined,
      accountId: record.accountId ?? undefined,
    });
  }
}
