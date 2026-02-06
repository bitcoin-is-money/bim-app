import type {SwapStatus, StoredSwap} from '../model';
import {ParsePaymentResponse} from '../services/pay.http.service';

export interface MockSwapConfig {
  /** Predefined status progression for created swaps: status after N polls */
  statusProgression: SwapStatus[];
}

export interface MockUserProfile {
  username: string;
  deployAccountSuccess: boolean;
  hasTransactions: boolean;
  balance: string; // raw WBTC amount (8 decimals), e.g. "125050000" = 1.2505 BTC
  paymentParseResult: ParsePaymentResponse | null; // null = 400 error on parse
  paymentExecuteSuccess: boolean;
  receiveInvoiceSuccess: boolean;
  /** Existing swaps for this user (preloaded in localStorage on login) */
  existingSwaps: StoredSwap[];
  /** How created swaps evolve over time */
  swapConfig: MockSwapConfig;
}

export const MOCK_USERS: MockUserProfile[] = [
  {
    // STARKNET USER - NO SWAPS (starknet doesn't create swaps)
    username: 'alice',
    deployAccountSuccess: true,
    hasTransactions: true,
    balance: '100000000', // 1 BTC in sats
    paymentExecuteSuccess: true,
    receiveInvoiceSuccess: true,
    paymentParseResult: {
      network: 'starknet',
      amount: {value: 50_000_000, currency: 'SAT'}, // 0.5 BTC
      fee: {value: 50_000, currency: 'SAT'}, // 0.1% BIM fee
      description: 'Payment to Starknet account',
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    },
    existingSwaps: [],
    swapConfig: {statusProgression: ['pending', 'paid', 'confirming', 'completed']},
  },
  {
    // LIGHTNING USER - HAS EXISTING SWAPS WITH ALL STATUSES
    username: 'bob',
    deployAccountSuccess: true,
    hasTransactions: true,
    balance: '125050000', // ~1.25 BTC in sats
    paymentExecuteSuccess: true,
    receiveInvoiceSuccess: true,
    paymentParseResult: {
      network: 'lightning',
      amount: {value: 500_000, currency: 'SAT'}, // 0.005 BTC
      fee: {value: 0, currency: 'SAT'}, // no BIM fee on Lightning swaps
      description: 'Lightning coffee payment',
      invoice: 'lnbc5m1pnxk7aasp5fake0invoice0for0testing0purposes0only0mock0data0qqqqqqqqqqqqqqqq',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
    existingSwaps: [
      {id: 'swap-bob-completed', type: 'receive', direction: 'lightning_to_starknet', amountSats: 100000, createdAt: new Date(Date.now() - 86400000).toISOString(), lastKnownStatus: 'completed'},
      {id: 'swap-bob-confirming', type: 'send', direction: 'starknet_to_lightning', amountSats: 50000, createdAt: new Date(Date.now() - 3600000).toISOString(), lastKnownStatus: 'confirming'},
      {id: 'swap-bob-paid', type: 'receive', direction: 'bitcoin_to_starknet', amountSats: 200000, createdAt: new Date(Date.now() - 1800000).toISOString(), lastKnownStatus: 'paid'},
      {id: 'swap-bob-pending', type: 'send', direction: 'starknet_to_bitcoin', amountSats: 75000, createdAt: new Date(Date.now() - 600000).toISOString(), lastKnownStatus: 'pending'},
      {id: 'swap-bob-expired', type: 'receive', direction: 'lightning_to_starknet', amountSats: 30000, createdAt: new Date(Date.now() - 172800000).toISOString(), lastKnownStatus: 'expired'},
      {id: 'swap-bob-failed', type: 'send', direction: 'starknet_to_lightning', amountSats: 15000, createdAt: new Date(Date.now() - 259200000).toISOString(), lastKnownStatus: 'failed'},
    ],
    swapConfig: {statusProgression: ['pending', 'paid', 'confirming', 'completed']},
  },
  {
    // BITCOIN USER - NO SWAPS YET, swap will progress to completed
    username: 'charlie',
    deployAccountSuccess: true,
    hasTransactions: false,
    balance: '1000000', // sats
    paymentExecuteSuccess: true,
    receiveInvoiceSuccess: true,
    paymentParseResult: {
      network: 'bitcoin',
      amount: {value: 10_000, currency: 'SAT'}, // 0.1 BTC
      fee: {value: 0, currency: 'SAT'}, // no BIM fee on Bitcoin swaps
      description: 'Bitcoin on-chain transfer',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    },
    existingSwaps: [],
    swapConfig: {statusProgression: ['pending', 'paid', 'confirming', 'completed']},
  },
  {
    // BALANCE 0 USER - UNABLE TO PAY
    username: 'eve',
    deployAccountSuccess: true,
    hasTransactions: false,
    balance: '0',  // sats
    paymentExecuteSuccess: true,
    receiveInvoiceSuccess: true,
    paymentParseResult: {
      network: 'starknet',
      amount: {value: 1_000, currency: 'SAT'},
      fee: {value: 1, currency: 'SAT'},
      description: 'Zero amount',
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    },
    existingSwaps: [],
    swapConfig: {statusProgression: ['pending', 'paid', 'confirming', 'completed']},
  },
  {
    // PAYMENT ERROR USER - swaps will fail
    username: 'marc',
    deployAccountSuccess: true,
    hasTransactions: false,
    balance: '100000',  // sats
    paymentExecuteSuccess: false,
    receiveInvoiceSuccess: false,
    paymentParseResult: {
      network: 'starknet',
      amount: {value: 1_000, currency: 'SAT'},
      fee: {value: 1, currency: 'SAT'},
      description: 'Zero amount',
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    },
    existingSwaps: [],
    swapConfig: {statusProgression: ['pending', 'failed']},
  },
  {
    // INVALID USER - swaps will expire
    username: 'mallory',
    deployAccountSuccess: false,
    hasTransactions: false,
    balance: '0',
    paymentExecuteSuccess: false,
    receiveInvoiceSuccess: false,
    paymentParseResult: {
      network: 'starknet',
      amount: {value: -100_000_000, currency: 'SAT'},
      fee: {value: 0, currency: 'SAT'},
      description: 'Negative amount',
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    },
    existingSwaps: [],
    swapConfig: {statusProgression: ['pending', 'expired']},
  }
];

export const DEFAULT_MOCK_USER: MockUserProfile = MOCK_USERS[0]!; // alice

export function getMockUser(username: string): MockUserProfile {
  return MOCK_USERS.find(u => u.username === username) ?? DEFAULT_MOCK_USER;
}
