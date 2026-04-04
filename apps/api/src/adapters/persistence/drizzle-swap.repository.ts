import * as schema from '@bim/db';
import type {Database} from '@bim/db/database';
import type {SwapRepository} from '@bim/domain/ports';
import {Amount, type BitcoinAddress, type StarknetAddress} from '@bim/domain/shared';
import type {LightningInvoice} from '@bim/domain/swap';
import {Swap, type SwapBase, type SwapData, type SwapDirection, SwapId, type SwapState, type SwapStatus} from '@bim/domain/swap';
import {and, eq, lt, notInArray, or} from 'drizzle-orm';
import {AbstractDrizzleRepository} from './abstract-drizzle.repository';

const TERMINAL_STATUSES: SwapStatus[] = ['completed', 'expired', 'failed', 'refunded', 'lost'];

/**
 * Drizzle-based implementation of SwapRepository.
 * Persists swap data in PostgreSQL via the bim_swaps table.
 */
export class DrizzleSwapRepository extends AbstractDrizzleRepository implements SwapRepository {

  constructor(db: Database) {
    super(db);
  }

  async save(swap: Swap): Promise<void> {
    const stateColumns = this.stateToColumns(swap.getState());
    const d = swap.data;
    const claimColumns = {
      lastClaimAttemptAt: d.lastClaimAttemptAt ?? null,
      lastClaimTxHash: d.lastClaimTxHash ?? null,
    };

    await this.resolveDb()
      .insert(schema.swaps)
      .values({
        id: d.id,
        direction: d.direction,
        amountSats: d.amount.getSat().toString(),
        destinationAddress: d.destinationAddress,
        sourceAddress: 'sourceAddress' in d ? d.sourceAddress : null,
        invoice: 'invoice' in d ? d.invoice : null,
        depositAddress: 'depositAddress' in d ? d.depositAddress : null,
        description: d.description,
        accountId: d.accountId,
        expiresAt: d.expiresAt,
        createdAt: d.createdAt,
        ...stateColumns,
        ...claimColumns,
      })
      .onConflictDoUpdate({
        target: schema.swaps.id,
        set: {
          ...stateColumns,
          ...claimColumns,
          depositAddress: 'depositAddress' in d ? (d.depositAddress ?? null) : null,
        },
      });
  }

  async findById(id: SwapId): Promise<Swap | undefined> {
    const record = await this.resolveDb().query.swaps.findFirst({
      where: eq(schema.swaps.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toSwap(record);
  }

  async findByStatus(status: SwapStatus): Promise<Swap[]> {
    const records = await this.resolveDb().query.swaps.findMany({
      where: eq(schema.swaps.status, status),
    });

    return records.map((record) => this.toSwap(record));
  }

  async findByDestinationAddress(address: string): Promise<Swap[]> {
    const records = await this.resolveDb().query.swaps.findMany({
      where: eq(schema.swaps.destinationAddress, address.toLowerCase()),
    });

    return records.map((record) => this.toSwap(record));
  }

  async findActive(): Promise<Swap[]> {
    const records = await this.resolveDb().query.swaps.findMany({
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
    const records = await this.resolveDb().query.swaps.findMany({
      where: eq(schema.swaps.direction, direction),
    });

    return records.map((record) => this.toSwap(record));
  }

  async delete(id: SwapId): Promise<void> {
    await this.resolveDb().delete(schema.swaps).where(eq(schema.swaps.id, id));
  }

  async deleteExpiredBefore(date: Date): Promise<number> {
    const result = await this.resolveDb()
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
      claimableAt: null as Date | null,
      confirmedAt: null as Date | null,
      completedAt: null as Date | null,
      expiredAt: null as Date | null,
      refundedAt: null as Date | null,
      lostAt: null as Date | null,
      failedAt: null as Date | null,
    };

    switch (state.status) {
      case 'pending':
        return base;
      case 'committed':
        return {...base, txHash: state.commitTxHash, confirmedAt: state.committedAt};
      case 'paid':
        return {...base, paidAt: state.paidAt};
      case 'claimable':
        return {...base, claimableAt: state.claimableAt};
      case 'completed':
        return {...base, txHash: state.txHash, completedAt: state.completedAt};
      case 'expired':
        return {...base, expiredAt: state.expiredAt};
      case 'refunded':
        return {...base, refundedAt: state.refundedAt};
      case 'failed':
        return {...base, errorMessage: state.error, failedAt: state.failedAt};
      case 'lost':
        return {...base, lostAt: state.lostAt};
    }
  }

  /* eslint-disable @typescript-eslint/no-non-null-assertion -- DB invariant: nullable columns are guaranteed non-null per status */
  private columnsToState(record: schema.SwapRecord): SwapState {
    switch (record.status) {
      case 'pending':
        return {status: 'pending'};
      case 'committed':
        return {status: 'committed', commitTxHash: record.txHash!, committedAt: record.confirmedAt!};
      case 'paid':
        return {status: 'paid', paidAt: record.paidAt!};
      case 'claimable':
        return {status: 'claimable', claimableAt: record.claimableAt!};
      case 'completed':
        return {status: 'completed', txHash: record.txHash!, completedAt: record.completedAt!};
      case 'expired':
        return {status: 'expired', expiredAt: record.expiredAt!};
      case 'refunded':
        return {status: 'refunded', refundedAt: record.refundedAt!};
      case 'failed':
        return {status: 'failed', error: record.errorMessage!, failedAt: record.failedAt!};
      case 'lost':
        return {status: 'lost', lostAt: record.lostAt!};
      default:
        throw new Error(`Unknown swap status: ${record.status}`);
    }
  }
  /* eslint-enable @typescript-eslint/no-non-null-assertion */

  private toSwap(record: schema.SwapRecord): Swap {
    const base: SwapBase = {
      id: SwapId.of(record.id),
      amount: Amount.ofSatoshi(BigInt(record.amountSats)),
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      description: record.description,
      accountId: record.accountId,
      ...(record.lastClaimAttemptAt !== null && {lastClaimAttemptAt: record.lastClaimAttemptAt}),
      ...(record.lastClaimTxHash !== null && {lastClaimTxHash: record.lastClaimTxHash}),
    };

    const data = this.buildSwapData(record, base);
    return new Swap(data, this.columnsToState(record));
  }

  /* eslint-disable @typescript-eslint/no-non-null-assertion -- DB invariant: direction-specific columns are guaranteed non-null */
  private buildSwapData(
    record: schema.SwapRecord,
    base: SwapBase,
  ): SwapData {
    switch (record.direction) {
      case 'lightning_to_starknet':
        return {
          ...base,
          direction: 'lightning_to_starknet',
          destinationAddress: record.destinationAddress as StarknetAddress,
          invoice: record.invoice!,
        };
      case 'bitcoin_to_starknet':
        return {
          ...base,
          direction: 'bitcoin_to_starknet',
          destinationAddress: record.destinationAddress as StarknetAddress,
          ...(record.depositAddress !== null && {depositAddress: record.depositAddress}),
        };
      case 'starknet_to_lightning':
        return {
          ...base,
          direction: 'starknet_to_lightning',
          sourceAddress: record.sourceAddress! as StarknetAddress,
          destinationAddress: record.destinationAddress,
          invoice: record.invoice! as LightningInvoice,
          depositAddress: record.depositAddress!,
        };
      case 'starknet_to_bitcoin':
        return {
          ...base,
          direction: 'starknet_to_bitcoin',
          sourceAddress: record.sourceAddress! as StarknetAddress,
          destinationAddress: record.destinationAddress as BitcoinAddress,
          depositAddress: record.depositAddress!,
        };
      default:
        throw new Error(`Unknown swap direction: ${record.direction}`);
    }
  }
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
}
