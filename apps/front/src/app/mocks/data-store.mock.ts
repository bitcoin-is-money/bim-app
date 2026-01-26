import type {Account} from '../services/auth.service';

const STORAGE_KEYS = {
  CREDENTIALS: 'mock_credentials',
  PENDING_CHALLENGES: 'mock_pending_challenges',
  CURRENT_SESSION: 'mock_current_session',
} as const;

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
    const entries: Array<[string, StoredCredential]> = JSON.parse(data);
    return new Map(entries);
  }

  saveCredential(credential: StoredCredential): void {
    const credentials = this.getCredentials();
    credentials.set(credential.credentialId, credential);
    localStorage.setItem(
      STORAGE_KEYS.CREDENTIALS,
      JSON.stringify([...credentials.entries()])
    );
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
    const entries: Array<[string, PendingChallenge]> = JSON.parse(data);
    return new Map(entries);
  }

  saveChallenge(challenge: PendingChallenge): void {
    const challenges = this.getPendingChallenges();
    challenges.set(challenge.challengeId, challenge);
    localStorage.setItem(
      STORAGE_KEYS.PENDING_CHALLENGES,
      JSON.stringify([...challenges.entries()])
    );
  }

  consumeChallenge(challengeId: string): PendingChallenge | undefined {
    const challenges = this.getPendingChallenges();
    const challenge = challenges.get(challengeId);
    if (challenge) {
      challenges.delete(challengeId);
      localStorage.setItem(
        STORAGE_KEYS.PENDING_CHALLENGES,
        JSON.stringify([...challenges.entries()])
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

  // Utils
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEYS.CREDENTIALS);
    localStorage.removeItem(STORAGE_KEYS.PENDING_CHALLENGES);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
  }
}
