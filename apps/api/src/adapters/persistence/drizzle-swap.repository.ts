import * as schema from '@bim/db';
import type {SwapRepository} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {Swap, type SwapDirection, SwapId, type SwapState, type SwapStatus} from '@bim/domain/swap';
import {and, eq, lt, notInArray, or} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';

const TERMINAL_STATUSES: SwapStatus[] = ['completed', 'expired', 'failed', 'refunded'];

/**
 * Drizzle-based implementation of SwapRepository.
 * Persists swap data in PostgreSQL via the bim_swaps table.
 */
export class DrizzleSwapRepository implements SwapRepository {

  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async save(swap: Swap): Promise<void> {
    const stateColumns = this.stateToColumns(swap.getState());

    await this.db
      .insert(schema.swaps)
      .values({
        id: swap.id,
        direction: swap.direction,
        amountSats: swap.amount.getSat().toString(),
        destinationAddress: swap.destinationAddress,
        sourceAddress: swap.sourceAddress ?? null,
        invoice: swap.invoice ?? null,
        depositAddress: swap.depositAddress ?? null,
        description: swap.description,
        accountId: swap.accountId,
        expiresAt: swap.expiresAt,
        createdAt: swap.createdAt,
        ...stateColumns,
      })
      .onConflictDoUpdate({
        target: schema.swaps.id,
        set: stateColumns,
      });
  }

  async findById(id: SwapId): Promise<Swap | undefined> {
    const record = await this.db.query.swaps.findFirst({
      where: eq(schema.swaps.id, id),
    });

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
      where: or(
        notInArray(schema.swaps.status, TERMINAL_STATUSES),
        // Expired bitcoin_to_starknet swaps are still active: the Atomiq smart
        // contract will auto-refund the security deposit after timelock expiry.
        and(
          eq(schema.swaps.status, 'expired'),
          eq(schema.swaps.direction, 'bitcoin_to_starknet'),
        ),
      ),
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
      case 'refunded':
        return {...base, expiredAt: state.refundedAt};
      case 'failed':
        return {...base, errorMessage: state.error, failedAt: state.failedAt};
    }
  }

  /* eslint-disable @typescript-eslint/no-non-null-assertion -- DB invariant: nullable columns are guaranteed non-null per status */
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
      case 'refunded':
        return {status: 'refunded', refundedAt: record.expiredAt!};
      case 'failed':
        return {status: 'failed', error: record.errorMessage!, failedAt: record.failedAt!};
      default:
        throw new Error(`Unknown swap status: ${record.status}`);
    }
  }
  /* eslint-enable @typescript-eslint/no-non-null-assertion */

  private toSwap(record: schema.SwapRecord): Swap {
    return new Swap(
      SwapId.of(record.id),
      record.direction as SwapDirection,
      Amount.ofSatoshi(BigInt(record.amountSats)),
      record.destinationAddress,
      record.sourceAddress ?? undefined,
      record.invoice ?? undefined,
      record.depositAddress ?? undefined,
      record.expiresAt,
      record.createdAt,
      this.columnsToState(record),
      record.description,
      record.accountId,
    );
  }
}
