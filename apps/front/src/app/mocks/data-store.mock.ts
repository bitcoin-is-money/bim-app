import type { Account, SwapDirection } from '../model';
import type { Language } from '../services/user-settings-http.service';
import { DEFAULT_MOCK_USER, type MockUserProfile } from './mock-users';

export interface StoredUserSettings {
  language: Language;
  preferredCurrencies: string[];
  defaultCurrency: string;
}

const STORAGE_KEYS = {
  CREDENTIALS: 'mock_credentials',
  PENDING_CHALLENGES: 'mock_pending_challenges',
  CURRENT_SESSION: 'mock_current_session',
  MOCK_USER_PROFILE: 'mock_user_profile',
  REGISTRATION_TIMESTAMP: 'mock_registration_timestamp',
  MOCK_SWAPS: 'mock_swaps',
  MOCK_SWAP_POLL_COUNTS: 'mock_swap_poll_counts',
  USER_SETTINGS: 'mock_user_settings',
} as const;

export interface MockSwapData {
  swapId: string;
  direction: SwapDirection;
  amountSats: number;
  destinationAddress: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoredCredential {
  credentialId: string;
  publicKey: string;
  userId: string;
  username: string;
  counter: number;
}

export interface PendingChallenge {
  challengeId: string;
  challenge: string;
  username?: string;
  type: 'registration' | 'authentication';
  expiresAt: number;
}

export class DataStoreMock {
  // Credentials
  getCredentials(): Map<string, StoredCredential> {
    const data = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
    if (!data) return new Map();
    const entries: [string, StoredCredential][] = JSON.parse(data);
    return new Map(entries);
  }

  saveCredential(credential: StoredCredential): void {
    const credentials = this.getCredentials();
    credentials.set(credential.credentialId, credential);
    localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify([...credentials.entries()]));
  }

  findCredentialByUsername(username: string): StoredCredential | undefined {
    const credentials = this.getCredentials();
    for (const credential of credentials.values()) {
      if (credential.username === username) {
        return credential;
      }
    }
    return undefined;
  }

  findCredentialById(credentialId: string): StoredCredential | undefined {
    return this.getCredentials().get(credentialId);
  }

  findCredentialByUserId(userId: string): StoredCredential | undefined {
    const credentials = this.getCredentials();
    for (const credential of credentials.values()) {
      if (credential.userId === userId) {
        return credential;
      }
    }
    return undefined;
  }

  // Pending Challenges
  getPendingChallenges(): Map<string, PendingChallenge> {
    const data = localStorage.getItem(STORAGE_KEYS.PENDING_CHALLENGES);
    if (!data) return new Map();
    const entries: [string, PendingChallenge][] = JSON.parse(data);
    return new Map(entries);
  }

  saveChallenge(challenge: PendingChallenge): void {
    const challenges = this.getPendingChallenges();
    challenges.set(challenge.challengeId, challenge);
    localStorage.setItem(
      STORAGE_KEYS.PENDING_CHALLENGES,
      JSON.stringify([...challenges.entries()]),
    );
  }

  consumeChallenge(challengeId: string): PendingChallenge | undefined {
    const challenges = this.getPendingChallenges();
    const challenge = challenges.get(challengeId);
    if (challenge) {
      challenges.delete(challengeId);
      localStorage.setItem(
        STORAGE_KEYS.PENDING_CHALLENGES,
        JSON.stringify([...challenges.entries()]),
      );
    }
    return challenge;
  }

  // Session
  getSession(): Account | null {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
    return data ? JSON.parse(data) : null;
  }

  setSession(account: Account | null): void {
    if (account) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(account));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
    }
  }

  // Mock User Profile
  setMockUserProfile(profile: MockUserProfile): void {
    localStorage.setItem(STORAGE_KEYS.MOCK_USER_PROFILE, JSON.stringify(profile));
  }

  getMockUserProfile(): MockUserProfile {
    const data = localStorage.getItem(STORAGE_KEYS.MOCK_USER_PROFILE);
    return data ? JSON.parse(data) : DEFAULT_MOCK_USER;
  }

  // Registration timestamp
  setRegistrationDate(date: Date): void {
    localStorage.setItem(STORAGE_KEYS.REGISTRATION_TIMESTAMP, date.toISOString());
  }

  getRegistrationDate(): Date | null {
    const dateIso = localStorage.getItem(STORAGE_KEYS.REGISTRATION_TIMESTAMP);
    return dateIso ? new Date(dateIso) : null;
  }

  // Mock Swaps (created during receive/pay)
  getSwaps(): Map<string, MockSwapData> {
    const data = localStorage.getItem(STORAGE_KEYS.MOCK_SWAPS);
    if (!data) return new Map();
    const entries: [string, MockSwapData][] = JSON.parse(data);
    return new Map(entries);
  }

  saveSwap(swap: MockSwapData): void {
    const swaps = this.getSwaps();
    swaps.set(swap.swapId, swap);
    localStorage.setItem(STORAGE_KEYS.MOCK_SWAPS, JSON.stringify([...swaps.entries()]));
  }

  getSwap(swapId: string): MockSwapData | undefined {
    return this.getSwaps().get(swapId);
  }

  // Poll counts (to track status progression)
  getPollCounts(): Map<string, number> {
    const data = localStorage.getItem(STORAGE_KEYS.MOCK_SWAP_POLL_COUNTS);
    if (!data) return new Map();
    const entries: [string, number][] = JSON.parse(data);
    return new Map(entries);
  }

  incrementPollCount(swapId: string): number {
    const counts = this.getPollCounts();
    const current = counts.get(swapId) ?? 0;
    const next = current + 1;
    counts.set(swapId, next);
    localStorage.setItem(STORAGE_KEYS.MOCK_SWAP_POLL_COUNTS, JSON.stringify([...counts.entries()]));
    return next;
  }

  getPollCount(swapId: string): number {
    return this.getPollCounts().get(swapId) ?? 0;
  }

  // User Settings
  getUserSettings(): StoredUserSettings {
    const data = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    if (data) {
      return JSON.parse(data);
    }
    // Default settings based on the current mock user profile
    const profile = this.getMockUserProfile();
    return {
      language: profile.language,
      preferredCurrencies: ['USD'],
      defaultCurrency: 'USD',
    };
  }

  setUserSettings(settings: StoredUserSettings): void {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
  }

  // Utils
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEYS.CREDENTIALS);
    localStorage.removeItem(STORAGE_KEYS.PENDING_CHALLENGES);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
    localStorage.removeItem(STORAGE_KEYS.MOCK_USER_PROFILE);
    localStorage.removeItem(STORAGE_KEYS.MOCK_SWAPS);
    localStorage.removeItem(STORAGE_KEYS.MOCK_SWAP_POLL_COUNTS);
    localStorage.removeItem(STORAGE_KEYS.USER_SETTINGS);
  }
}
