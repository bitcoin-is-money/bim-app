import {defineIndexer, type HandlerArgs} from '@apibara/indexer';
import {drizzle as apibaraDrizzle, drizzleStorage, useDrizzleStorage} from '@apibara/plugin-drizzle';
import {type Block, getSelector, StarknetStream} from '@apibara/starknet';
import * as schema from '@bim/db';
import {DatabaseConnection} from '@bim/db/connection';
import {createLogger} from '@bim/lib/logger';
import {redactUrl} from '@bim/lib/url';
import type {ApibaraRuntimeConfig} from 'apibara/types';
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
  const logger: Logger = createRootLogger().child({name: "indexer.ts"});
  try {
    logger.info({version: process.env.APP_VERSION ?? 'dev'}, 'Indexer initializing');
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

  logger.info({connectionString: redactUrl(connectionString)}, 'Checking database availability');
  await DatabaseConnection.checkAvailability({url: connectionString}, logger);
  logger.info('Database connectivity verified');

  const decoder = new TransferEventDecoder(logger);
  const accountCache = new AccountCache(Number(runtimeConfig.accountCacheTtlMs), logger);
  const matcher = new TransactionMatcher(runtimeConfig.contractAddress, logger);
  const writer = new TransactionWriter(logger);
  // Only expose tables the indexer writes to. drizzleStorage creates blockchain
  // reorganization triggers on every table in the schema, which causes deadlocks
  // with tables managed by other services.
  // Read-only tables (accounts) work fine via schema.accounts in queries.
  const db = apibaraDrizzle({
    type: 'node-postgres',
    connectionString,
    schema: {transactions: schema.transactions},
    poolConfig: {
      max: 10,
    }
  });

  // properly log error (otherwise we do not have root cause on Apibara error)
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({err}, 'Uncaught exception — shutting down');
    setTimeout(() => process.exit(1), 1000);
  });

  const PROGRESS_LOG_INTERVAL_MS = 3600_000;
  let lastProgressLog = Date.now();
  let blocksProcessed = 0;

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
      process.send?.({type: 'heartbeat'});
      blocksProcessed++;
      const now = Date.now();
      if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL_MS) {
        logger.info(`Indexer alive (${blocksProcessed} processed blocks)`);
        lastProgressLog = now;
        blocksProcessed = 0;
      }
      try {
        const {blockNumber, blockTimestamp, events} = extractBlockContext(args);
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
          blockNumber: args.endCursor?.orderKey.toString(),
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
): BlockContext {
  const blockNumber = args.endCursor?.orderKey.toString() ?? '0';
  const events = args.block.events;
  const blockTimestamp = args.block.header.timestamp;

  return {blockNumber, blockTimestamp, events};
}

function createRootLogger(): Logger {
  try {
    return createLogger(undefined, INDEXER_LOGGER_CONFIG);
  } catch (error) {
    console.error('[indexer] Unable to create logger', error);
    process.kill(process.ppid, 'SIGTERM');
    process.exit(1);
  }
}

