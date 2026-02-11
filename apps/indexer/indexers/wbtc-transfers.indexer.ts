import {defineIndexer, type HandlerArgs} from '@apibara/indexer';
import {drizzle as apibaraDrizzle, drizzleStorage, useDrizzleStorage,} from '@apibara/plugin-drizzle';
import {type Block, getSelector, StarknetStream} from '@apibara/starknet';
import type {NewTransactionRecord} from "@bim/db";
import * as schema from '@bim/db';
import type {ApibaraRuntimeConfig} from "apibara/types";
import {getTableName} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {AccountCache} from '../src/account-cache.js';
import {buildTransactionRows, decodeTransferEvents} from '../src/process-transfers.js';
import type {TransferEvent} from "../src/types";

const TRANSFER_KEY = getSelector('Transfer');

async function assertConnectionStringNotEmpty(connectionString: string): Promise<void> {
  if (!connectionString || connectionString.length === 0) {
    console.error(
      '[indexer] DATABASE_URL environment variable is not set.'
    );
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
}

async function assertSchemaReady(connectionString: string): Promise<void> {
  const db = drizzle(connectionString);
  try {
    await db
      .select({id: schema.transactions.id})
      .from(schema.transactions)
      .limit(1);
  } catch {
    const table = getTableName(schema.transactions);
    console.error(
      `[indexer] Table "${table}" does not exist. ` +
      'Push the schema first, run:\nDATABASE_URL=... npm run db:push -w @bim/api'
    );
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
}

interface RuntimeConfig extends ApibaraRuntimeConfig {
  connectionString: string;
  streamUrl: string;
  contractAddress: string;
  startingBlock: string;
  accountCacheTtlMs: string;
}

// Entry point automatically discovered by the Apibara CLI (`apibara indexers`).
// Receives runtime config (DB connection, stream URL, contract address, starting block)
// and returns a StarknetStream indexer that watches ERC20 Transfer events for the given contract.
export default async function (runtimeConfig: RuntimeConfig) {
  await assertConnectionStringNotEmpty(runtimeConfig.connectionString);
  await assertSchemaReady(runtimeConfig.connectionString);

  const accountCache = new AccountCache(Number(runtimeConfig.accountCacheTtlMs));

  const db = apibaraDrizzle({
    connectionString: runtimeConfig.connectionString,
    schema,
  });

  return defineIndexer(StarknetStream)({
    streamUrl: runtimeConfig.streamUrl,
    finality: 'accepted',
    startingCursor: {
      orderKey: BigInt(runtimeConfig.startingBlock),
    },
    filter: {
      header: 'always',
      events: [
        {
          address: runtimeConfig.contractAddress as `0x${string}`,
          keys: [TRANSFER_KEY],
          includeTransaction: true,
        },
      ],
    },
    plugins: [drizzleStorage({db})],

    // Called by Apibara for each block matching the filter.
    // Decodes ERC20 Transfer events and upserts matching transactions.
    async transform(args: HandlerArgs<Block>) {
      const {db} = useDrizzleStorage();
      if (!args.block.events?.length) return;

      const blockNumber = args.endCursor?.orderKey?.toString() ?? '0';
      const blockTimestamp = args.block.header?.timestamp
        ? new Date(Number(args.block.header.timestamp) * 1000)
        : new Date();

      const transfers: TransferEvent[] = decodeTransferEvents(args.block.events);
      if (transfers.length === 0) return;

      const accounts = await accountCache.get(db);

      const rows: NewTransactionRecord[] = buildTransactionRows(
        transfers,
        accounts,
        runtimeConfig.contractAddress,
        blockNumber,
        blockTimestamp,
      );

      if (rows.length > 0) {
        await db
          .insert(schema.transactions)
          .values(rows)
          .onConflictDoNothing();
      }
    },
  });
}
