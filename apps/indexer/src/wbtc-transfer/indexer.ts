import {defineIndexer, type HandlerArgs} from '@apibara/indexer';
import {drizzle as apibaraDrizzle, drizzleStorage, useDrizzleStorage} from '@apibara/plugin-drizzle';
import {type Block, getSelector, StarknetStream} from '@apibara/starknet';
import * as schema from '@bim/db';
import {createLogger} from '@bim/lib/logger';
import {redactUrl} from '@bim/lib/url';
import type {ApibaraRuntimeConfig} from 'apibara/types';
import {getTableName, sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {basename} from "node:path";
import type {Logger} from 'pino';
import {AccountCache} from './account-cache.js';
import {INDEXER_LOGGER_CONFIG} from "./logger-config";
import {TransactionMatcher} from './transaction-matcher.js';
import {TransactionWriter} from './transaction-writer.js';
import {TransferEventDecoder} from './transfer-event-decoder.js';
import type {TransferEvent} from "./types";

const TRANSFER_KEY = getSelector('Transfer');

export interface WbtcRuntimeConfig extends ApibaraRuntimeConfig {
  connectionString: string;
  streamUrl: string;
  contractAddress: string;
  startingBlock: string;
  accountCacheTtlMs: string;
}

// Creates a StarknetStream indexer that watches ERC20 Transfer events for a given WBTC contract.
// Validates DB connectivity at startup, then delegates per-block processing to the chain:
// decode → cache → match → write.
export async function createWbtcTransferIndexer(cfg: WbtcRuntimeConfig) {
  const logger: Logger = createRootLogger().child({name: basename(import.meta.filename)});
  try {
    logger.info('Indexer initializing');
    return await createWbtcTransferIndexerInternal(cfg, logger);
  } catch (error) {
    logger.fatal(error, 'Fatal startup error');
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
}

async function createWbtcTransferIndexerInternal(
  runtimeConfig: WbtcRuntimeConfig,
  logger: Logger,
) {
  const connectionString: string = runtimeConfig.connectionString;
  assertConnectionStringSet(connectionString, logger);
  await assertDatabaseStarted(connectionString, logger);
  await assertTransactionTableExists(connectionString, logger);
  logger.info('Database connectivity verified');

  const decoder = new TransferEventDecoder(logger);
  const accountCache = new AccountCache(Number(runtimeConfig.accountCacheTtlMs), logger);
  const matcher = new TransactionMatcher(runtimeConfig.contractAddress, logger);
  const writer = new TransactionWriter(logger);
  const db = apibaraDrizzle({connectionString, schema});

  logger.info({
    streamUrl: runtimeConfig.streamUrl,
    contractAddress: runtimeConfig.contractAddress,
    startingBlock: runtimeConfig.startingBlock,
  }, 'Indexer starting');

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

    async transform(args: HandlerArgs<Block>) {
      try {
        const {blockNumber, blockTimestamp, events} = extractBlockContext(args, logger);
        if (events.length === 0) return;

        const transfers: TransferEvent[] = decoder.decode(events);
        if (transfers.length === 0) return;

        const {db} = useDrizzleStorage();
        const accounts = await accountCache.get(db);
        const rows = matcher.match(transfers, accounts, blockNumber, blockTimestamp);
        await writer.write(db, rows, blockNumber);
      } catch (error) {
        logger.error({
          err: error,
          blockNumber: args.endCursor?.orderKey?.toString(),
        }, 'Failed to process transfer block');
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

interface BlockContext {
  blockNumber: string;
  blockTimestamp: Date;
  events: Block['events'];
}

function extractBlockContext(
  args: HandlerArgs<Block>,
  logger: Logger
): BlockContext {
  const blockNumber = args.endCursor?.orderKey?.toString() ?? '0';
  const events = args.block.events ?? [];

  let blockTimestamp: Date;
  if (args.block.header?.timestamp) {
    blockTimestamp = new Date(Number(args.block.header.timestamp) * 1000);
  } else {
    logger.warn({blockNumber}, 'Block missing timestamp, using current time');
    blockTimestamp = new Date();
  }

  logger.debug({blockNumber, eventCount: events.length}, 'Processing block');
  return {blockNumber, blockTimestamp, events};
}

function createRootLogger(): Logger {
  try {
    return createLogger('info', INDEXER_LOGGER_CONFIG);
  } catch (error) {
    console.error('[indexer] Unable to create logger', error);
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
}

function assertConnectionStringSet(
  connectionString: string | undefined,
  logger: Logger,
): void {
  if (!connectionString) {
    logger.fatal('DATABASE_URL environment variable is not set');
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
  logger.info(`connectionString set to ${redactUrl(connectionString)}`);
}

async function assertDatabaseStarted(
  connectionString: string,
  logger: Logger,
): Promise<void> {
  try {
    const db = drizzle(connectionString);
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    logger.fatal(err, 'PostgreSQL database is not started');
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
}

async function assertTransactionTableExists(
  connectionString: string,
  logger: Logger,
): Promise<void> {
  const db = drizzle(connectionString);
  const tableName = getTableName(schema.transactions);
  const schemaName = 'public';

  const result = await db.execute(sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = ${schemaName}
      AND table_name = ${tableName}
  `);

  if (result.rowCount === 0) {
    logger.fatal(
      `Table "${tableName}" does not exist. Push the schema first:\nDATABASE_URL=... npm run db:push -w @bim/api`,
    );
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
}
