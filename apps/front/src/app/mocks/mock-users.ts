import type {StoredSwap, SwapStatus} from '../model';
import type {Language} from '../services/user-settings-http.service';
import type {ParsePaymentResponse} from '../services/pay.http.service';

export interface MockSwapConfig {
  /** Predefined status progression for created swaps: status after N polls */
  statusProgression: SwapStatus[];
}

export interface MockUserProfile {
  username: string;
  starknetAddress: string | null;
  deploymentTxHash: string | null;
  createdAt: string; // ISO date
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
  /** User's preferred language */
  language: Language;
}

export const MOCK_USERS: MockUserProfile[] = [
  {
    // STARKNET USER - NO SWAPS (starknet doesn't create swaps)
    username: 'alice',
    starknetAddress: '0x04a3b2c1d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8',
    deploymentTxHash: '0x01ab23cd45ef6789ab01cd23ef4567890123456789abcdef0123456789abcdef',
    createdAt: '2025-11-15T10:30:00.000Z',
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
    language: 'en',
  },
  {
    // LIGHTNING USER - HAS EXISTING SWAPS WITH ALL STATUSES
    username: 'bob',
    starknetAddress: '0x05b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5',
    deploymentTxHash: '0x02bc34de56fa7890bc02de34fa5678901234567890abcdef1234567890abcdef',
    createdAt: '2025-12-01T14:00:00.000Z',
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
    language: 'en',
  },
  {
    // BITCOIN USER - NO SWAPS YET, swap will progress to completed
    username: 'charlie',
    starknetAddress: '0x06c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6',
    deploymentTxHash: '0x03cd45ef67ab8901cd03ef45ab6789012345678901abcdef2345678901abcdef',
    createdAt: '2026-01-10T08:15:00.000Z',
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
    language: 'en',
  },
  {
    // BALANCE 0 USER - UNABLE TO PAY
    username: 'eve',
    starknetAddress: '0x07d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7',
    deploymentTxHash: '0x04de56fa78bc9012de04fa56bc7890123456789012abcdef3456789012abcdef',
    createdAt: '2026-01-20T16:45:00.000Z',
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
    language: 'en',
  },
  {
    // PAYMENT ERROR USER - swaps will fail - FRENCH USER
    username: 'marc',
    starknetAddress: '0x08e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8',
    deploymentTxHash: '0x05ef67ab89cd0123ef05ab67cd8901234567890123abcdef4567890123abcdef',
    createdAt: '2026-02-01T09:00:00.000Z',
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
    language: 'fr',
  },
  {
    // INVALID USER - swaps will expire - FRENCH USER
    username: 'mallory',
    starknetAddress: '0x09f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9',
    deploymentTxHash: null,
    createdAt: '2026-02-10T12:30:00.000Z',
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
    language: 'fr',
  }
];

export const DEFAULT_MOCK_USER: MockUserProfile = MOCK_USERS[0]!; // alice

export function getMockUser(username: string): MockUserProfile {
  return MOCK_USERS.find(u => u.username === username) ?? DEFAULT_MOCK_USER;
}
