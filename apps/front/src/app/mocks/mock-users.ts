import {ParsePaymentResponse} from '../services/payment.http.service';

export interface MockUserProfile {
  username: string;
  deployAccountSuccess: boolean;
  hasTransactions: boolean;
  balance: string; // raw WBTC amount (8 decimals), e.g. "125050000" = 1.2505 BTC
  paymentParseResult: ParsePaymentResponse | null; // null = 400 error on parse
}

export const MOCK_USERS: MockUserProfile[] = [
  {
    username: 'alice',
    deployAccountSuccess: true,
    hasTransactions: true,
    balance: '100000000', // 1 BTC in sats
    paymentParseResult: {
      network: 'starknet',
      amount: {value: 50_000_000, currency: 'SAT'}, // 0.5 BTC
      fee: {value: 50_000, currency: 'SAT'}, // 0.1% BIM fee
      description: 'Payment to Starknet account',
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    },
  },
  {
    username: 'bob',
    deployAccountSuccess: true,
    hasTransactions: true,
    balance: '125050000', // ~1.25 BTC in sats
    paymentParseResult: {
      network: 'lightning',
      amount: {value: 500_000, currency: 'SAT'}, // 0.005 BTC
      fee: {value: 0, currency: 'SAT'}, // no BIM fee on Lightning swaps
      description: 'Lightning coffee payment',
      invoice: 'lnbc5m1pnxk7aasp5fake0invoice0for0testing0purposes0only0mock0data0qqqqqqqqqqqqqqqq',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  },
  {
    username: 'charlie',
    deployAccountSuccess: true,
    hasTransactions: true,
    balance: '1000', // 1000 sats
    paymentParseResult: {
      network: 'bitcoin',
      amount: {value: 10_000_000, currency: 'SAT'}, // 0.1 BTC
      fee: {value: 0, currency: 'SAT'}, // no BIM fee on Bitcoin swaps
      description: 'Bitcoin on-chain transfer',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    },
  },
  {
    username: 'eve',
    deployAccountSuccess: true,
    hasTransactions: false,
    balance: '0',
    paymentParseResult: {
      network: 'starknet',
      amount: {value: 0, currency: 'SAT'},
      fee: {value: 0, currency: 'SAT'},
      description: 'Zero amount',
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    },
  },
  {
    username: 'mallory',
    deployAccountSuccess: false,
    hasTransactions: true,
    balance: '125050000',
    paymentParseResult: {
      network: 'starknet',
      amount: {value: -100_000_000, currency: 'SAT'},
      fee: {value: 0, currency: 'SAT'},
      description: 'Negative amount',
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      tokenAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    },
  },
  {
    username: 'error',
    deployAccountSuccess: false,
    hasTransactions: false,
    balance: '0',
    paymentParseResult: null,
  },
];

export const DEFAULT_MOCK_USER: MockUserProfile = MOCK_USERS[0]!; // alice

export function getMockUser(username: string): MockUserProfile {
  return MOCK_USERS.find(u => u.username === username) ?? DEFAULT_MOCK_USER;
}
