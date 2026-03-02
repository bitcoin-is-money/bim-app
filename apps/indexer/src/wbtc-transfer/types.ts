import type {useDrizzleStorage} from '@apibara/plugin-drizzle';

/** Drizzle DB instance provided by Apibara's plugin at runtime. */
export type ApibaraDb = ReturnType<typeof useDrizzleStorage>['db'];

export interface TransferEvent {
  from: string;
  to: string;
  amount: string;
  txHash: string;
}

export interface AccountMatch {
  id: string;
  starknetAddress: string;
}
